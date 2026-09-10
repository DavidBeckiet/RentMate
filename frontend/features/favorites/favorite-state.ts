"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";

const boundedFavoriteQuery = { page: 1, pageSize: 100 } as const;

type FavoriteStateStatus = "idle" | "loading" | "partial" | "ready" | "error";

interface FavoriteSnapshot {
  readonly accountId: number | null;
  readonly status: FavoriteStateStatus;
  readonly ids: ReadonlySet<number>;
  readonly overrides: ReadonlyMap<number, boolean>;
  readonly pendingIds: ReadonlySet<number>;
}

interface FavoriteMutation {
  readonly accountId: number;
  readonly desiredSaved: boolean;
  readonly controller: AbortController;
  readonly promise: Promise<boolean>;
}

export interface FavoriteStateOptions {
  readonly autoLoad?: boolean;
}

export interface FavoriteStateValue {
  readonly status: FavoriteStateStatus;
  readonly isFavorite: (listingId: number, fallback?: boolean) => boolean;
  readonly isPending: (listingId: number) => boolean;
  readonly pendingTarget: (listingId: number) => boolean | null;
  readonly toggle: (listingId: number, fallback?: boolean) => Promise<boolean>;
  readonly remove: (listingId: number, fallback?: boolean) => Promise<boolean>;
  readonly syncFromPage: (listingIds: readonly number[], complete: boolean) => void;
}

const serverSnapshot: FavoriteSnapshot = {
  accountId: null,
  status: "idle",
  ids: new Set<number>(),
  overrides: new Map<number, boolean>(),
  pendingIds: new Set<number>()
};

let snapshot: FavoriteSnapshot = serverSnapshot;
let generation = 0;
let loadRequest: { readonly accountId: number; readonly controller: AbortController } | null = null;
const mutations = new Map<number, FavoriteMutation>();
const listeners = new Set<() => void>();

function emit(next: FavoriteSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function updateSnapshot(
  changes: Partial<Pick<FavoriteSnapshot, "accountId" | "status" | "ids" | "overrides" | "pendingIds">>
): void {
  emit({ ...snapshot, ...changes });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function abortActiveRequests(): void {
  loadRequest?.controller.abort();
  loadRequest = null;
  for (const mutation of mutations.values()) mutation.controller.abort();
  mutations.clear();
}

function activateAccount(accountId: number | null): void {
  if (snapshot.accountId === accountId) return;

  generation += 1;
  abortActiveRequests();
  emit({
    accountId,
    status: "idle",
    ids: new Set<number>(),
    overrides: new Map<number, boolean>(),
    pendingIds: new Set<number>()
  });
}

function applyDesiredState(ids: Set<number>, listingId: number, saved: boolean): void {
  if (saved) ids.add(listingId);
  else ids.delete(listingId);
}

function readFavorite(listingId: number, fallback: boolean, accountId: number | null): boolean {
  if (accountId === null || snapshot.accountId !== accountId) return fallback;
  const override = snapshot.overrides.get(listingId);
  if (override !== undefined) return override;
  if (snapshot.ids.has(listingId)) return true;
  if (snapshot.status === "ready") return false;
  return fallback;
}

function readPending(listingId: number): boolean {
  return snapshot.pendingIds.has(listingId);
}

function readPendingTarget(listingId: number): boolean | null {
  return mutations.get(listingId)?.desiredSaved ?? null;
}

function startLoad(accountId: number): void {
  if (snapshot.accountId !== accountId || snapshot.status === "loading" || snapshot.status === "ready") return;
  if (typeof api.favorites.list !== "function") return;

  const controller = new AbortController();
  const requestGeneration = generation;
  loadRequest = { accountId, controller };
  updateSnapshot({ status: "loading" });

  void Promise.resolve()
    .then(() => api.favorites.list(boundedFavoriteQuery, controller.signal))
    .then((page) => {
      if (controller.signal.aborted || generation !== requestGeneration || snapshot.accountId !== accountId) return;
      const ids = new Set(page.data.map((listing) => listing.id));
      for (const [listingId, override] of snapshot.overrides) applyDesiredState(ids, listingId, override);
      for (const [listingId, mutation] of mutations) {
        if (mutation.accountId === accountId) applyDesiredState(ids, listingId, mutation.desiredSaved);
      }
      updateSnapshot({ status: "ready", ids, overrides: new Map<number, boolean>() });
    })
    .catch(() => {
      if (controller.signal.aborted || generation !== requestGeneration || snapshot.accountId !== accountId) return;
      updateSnapshot({ status: "error" });
    })
    .finally(() => {
      if (loadRequest?.controller === controller) loadRequest = null;
    });
}

function mutate(accountId: number, listingId: number, desiredSaved: boolean, fallback: boolean): Promise<boolean> {
  const existing = mutations.get(listingId);
  if (existing?.accountId === accountId) return existing.promise;

  const previousSaved = readFavorite(listingId, fallback, accountId);
  const controller = new AbortController();
  const requestGeneration = generation;

  let request: Promise<void>;
  try {
    request = desiredSaved
      ? api.favorites.add(listingId, controller.signal)
      : api.favorites.remove(listingId, controller.signal);
  } catch (error: unknown) {
    request = Promise.reject(error);
  }

  const promise = Promise.resolve(request)
    .then(() => {
      if (controller.signal.aborted || generation !== requestGeneration || snapshot.accountId !== accountId)
        return desiredSaved;
      const ids = new Set(snapshot.ids);
      applyDesiredState(ids, listingId, desiredSaved);
      const overrides = new Map(snapshot.overrides);
      if (snapshot.status === "ready") overrides.delete(listingId);
      else overrides.set(listingId, desiredSaved);
      updateSnapshot({ ids, overrides, pendingIds: withoutId(snapshot.pendingIds, listingId) });
      if (desiredSaved) void api.analytics?.trackListingEvent?.(listingId, "FAVORITE").catch(() => undefined);
      return desiredSaved;
    })
    .catch((error: unknown) => {
      if (!controller.signal.aborted && generation === requestGeneration && snapshot.accountId === accountId) {
        const ids = new Set(snapshot.ids);
        applyDesiredState(ids, listingId, previousSaved);
        const overrides = new Map(snapshot.overrides);
        if (snapshot.status === "ready") overrides.delete(listingId);
        else overrides.set(listingId, previousSaved);
        updateSnapshot({ ids, overrides, pendingIds: withoutId(snapshot.pendingIds, listingId) });
      }
      throw error;
    })
    .finally(() => {
      const current = mutations.get(listingId);
      if (current?.promise === promise) mutations.delete(listingId);
    });

  mutations.set(listingId, { accountId, desiredSaved, controller, promise });
  const ids = new Set(snapshot.ids);
  applyDesiredState(ids, listingId, desiredSaved);
  const overrides = new Map(snapshot.overrides);
  overrides.set(listingId, desiredSaved);
  updateSnapshot({ ids, overrides, pendingIds: withId(snapshot.pendingIds, listingId) });
  return promise;
}

function withId(ids: ReadonlySet<number>, listingId: number): ReadonlySet<number> {
  const next = new Set(ids);
  next.add(listingId);
  return next;
}

function withoutId(ids: ReadonlySet<number>, listingId: number): ReadonlySet<number> {
  const next = new Set(ids);
  next.delete(listingId);
  return next;
}

function syncFromPage(accountId: number, listingIds: readonly number[], complete: boolean): void {
  if (snapshot.accountId !== accountId) return;
  const ids = complete ? new Set(listingIds) : new Set(snapshot.ids);
  if (!complete) for (const listingId of listingIds) ids.add(listingId);
  for (const [listingId, override] of snapshot.overrides) applyDesiredState(ids, listingId, override);
  for (const [listingId, mutation] of mutations) {
    if (mutation.accountId === accountId) applyDesiredState(ids, listingId, mutation.desiredSaved);
  }
  if (complete) {
    loadRequest?.controller.abort();
    loadRequest = null;
  }
  updateSnapshot({ status: complete ? "ready" : "partial", ids });
}

export function resetFavoriteStateForTests(): void {
  generation += 1;
  abortActiveRequests();
  emit(serverSnapshot);
}

export function useFavoriteState(options: FavoriteStateOptions = {}): FavoriteStateValue {
  const { autoLoad = true } = options;
  const { status: authStatus, user } = useAuth();
  const accountId = authStatus === "authenticated" && user?.role === "TENANT" ? user.id : null;
  const currentSnapshot = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => serverSnapshot
  );

  useEffect(() => {
    activateAccount(accountId);
    if (accountId !== null && autoLoad) startLoad(accountId);
  }, [accountId, autoLoad]);

  const isFavorite = useCallback(
    (listingId: number, fallback = false) => readFavorite(listingId, fallback, accountId),
    [accountId]
  );
  const isPending = useCallback((listingId: number) => readPending(listingId), []);
  const pendingTarget = useCallback((listingId: number) => readPendingTarget(listingId), []);
  const toggle = useCallback(
    (listingId: number, fallback = false) => {
      if (accountId === null) return Promise.reject(new Error("Favorite actions require a tenant session."));
      return mutate(accountId, listingId, !readFavorite(listingId, fallback, accountId), fallback);
    },
    [accountId]
  );
  const remove = useCallback(
    (listingId: number, fallback = true) => {
      if (accountId === null) return Promise.reject(new Error("Favorite actions require a tenant session."));
      return mutate(accountId, listingId, false, fallback);
    },
    [accountId]
  );
  const syncPage = useCallback(
    (listingIds: readonly number[], complete: boolean) => {
      if (accountId !== null) syncFromPage(accountId, listingIds, complete);
    },
    [accountId]
  );

  return {
    status: currentSnapshot.status,
    isFavorite,
    isPending,
    pendingTarget,
    toggle,
    remove,
    syncFromPage: syncPage
  };
}
