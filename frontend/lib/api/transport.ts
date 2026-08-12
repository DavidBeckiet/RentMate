import type { ApiErrorDetail, ApiPage } from "../../types/api";

export type ApiErrorCategory = "backend" | "network" | "unexpected";

export class ApiError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly requestId: string | null;
  readonly details: readonly ApiErrorDetail[];
  readonly category: ApiErrorCategory;

  constructor(input: {
    readonly status: number | null;
    readonly code: string;
    readonly message: string;
    readonly requestId?: string | null;
    readonly details?: readonly ApiErrorDetail[];
    readonly category: ApiErrorCategory;
  }) {
    super(input.message);
    this.name = "ApiError";
    this.status = input.status;
    this.code = input.code;
    this.requestId = input.requestId ?? null;
    this.details = input.details ?? [];
    this.category = input.category;
  }
}

type QueryValue = string | number | boolean | readonly string[] | null | undefined;

export type ApiQuery = Readonly<Record<string, QueryValue>> | object;

export interface TransportRequestOptions {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly query?: ApiQuery;
  readonly json?: object;
  readonly formData?: FormData;
  readonly signal?: AbortSignal;
}

export interface ApiTransport {
  readonly raw: <T>(path: string, options?: TransportRequestOptions) => Promise<T>;
  readonly object: <T>(path: string, options?: TransportRequestOptions) => Promise<T>;
  readonly page: <T>(path: string, options?: TransportRequestOptions) => Promise<ApiPage<T>>;
  readonly void: (path: string, options?: TransportRequestOptions) => Promise<void>;
}

export interface CreateTransportOptions {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
}

const DEFAULT_API_BASE_URL = "http://localhost:4000";
const UNEXPECTED_MESSAGE = "The server returned an unexpected response.";
const NETWORK_MESSAGE = "Unable to reach the server.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unexpectedResponse(status: number | null = null): ApiError {
  return new ApiError({
    status,
    code: "UNEXPECTED_RESPONSE",
    message: UNEXPECTED_MESSAGE,
    category: "unexpected"
  });
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function serializeQuery(query?: ApiQuery): string {
  if (!query) return "";

  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    parameters.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }

  const serialized = parameters.toString();
  return serialized ? `?${serialized}` : "";
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw unexpectedResponse(response.status);
  }
}

function parseErrorDetail(value: unknown): ApiErrorDetail | null {
  if (!isRecord(value) || typeof value.field !== "string" || typeof value.code !== "string") return null;
  if (value.message !== undefined && typeof value.message !== "string") return null;

  return {
    field: value.field,
    code: value.code,
    ...(value.message === undefined ? {} : { message: value.message })
  };
}

async function backendError(response: Response): Promise<ApiError> {
  const payload = await parseJson(response);
  if (!isRecord(payload) || !isRecord(payload.error)) throw unexpectedResponse(response.status);

  const { code, message, requestId, details } = payload.error;
  if (typeof code !== "string" || typeof message !== "string" || typeof requestId !== "string") {
    throw unexpectedResponse(response.status);
  }

  if (details !== undefined && !Array.isArray(details)) throw unexpectedResponse(response.status);
  const parsedDetails = details?.map(parseErrorDetail) ?? [];
  if (parsedDetails.some((detail) => detail === null)) throw unexpectedResponse(response.status);

  return new ApiError({
    status: response.status,
    code,
    message,
    requestId,
    details: parsedDetails.filter((detail): detail is ApiErrorDetail => detail !== null),
    category: "backend"
  });
}

function assertRequestBody(options: TransportRequestOptions): void {
  if (options.json !== undefined && options.formData !== undefined) {
    throw new TypeError("A request cannot contain both JSON and FormData bodies.");
  }
}

export function createTransport(options: CreateTransportOptions = {}): ApiTransport {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL);
  const fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init));

  async function request(path: string, requestOptions: TransportRequestOptions = {}): Promise<Response> {
    assertRequestBody(requestOptions);
    const headers = new Headers();
    let body: BodyInit | undefined;

    if (requestOptions.json !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(requestOptions.json);
    } else if (requestOptions.formData !== undefined) {
      body = requestOptions.formData;
    }

    try {
      const response = await fetcher(`${baseUrl}${path}${serializeQuery(requestOptions.query)}`, {
        method: requestOptions.method ?? "GET",
        credentials: "include",
        headers,
        body,
        signal: requestOptions.signal
      });

      if (!response.ok) throw await backendError(response);
      return response;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError({
        status: null,
        code: "NETWORK_ERROR",
        message: NETWORK_MESSAGE,
        category: "network"
      });
    }
  }

  return {
    async raw<T>(path: string, requestOptions?: TransportRequestOptions) {
      const response = await request(path, requestOptions);
      const payload = await parseJson(response);
      if (!isRecord(payload)) throw unexpectedResponse(response.status);
      return payload as T;
    },

    async object<T>(path: string, requestOptions?: TransportRequestOptions) {
      const response = await request(path, requestOptions);
      const payload = await parseJson(response);
      if (!isRecord(payload) || !("data" in payload)) throw unexpectedResponse(response.status);
      return payload.data as T;
    },

    async page<T>(path: string, requestOptions?: TransportRequestOptions) {
      const response = await request(path, requestOptions);
      const payload = await parseJson(response);
      if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.pagination)) {
        throw unexpectedResponse(response.status);
      }

      const { page, pageSize, hasNextPage } = payload.pagination;
      if (typeof page !== "number" || typeof pageSize !== "number" || typeof hasNextPage !== "boolean") {
        throw unexpectedResponse(response.status);
      }

      return { data: payload.data as readonly T[], pagination: { page, pageSize, hasNextPage } };
    },

    async void(path, requestOptions) {
      const response = await request(path, requestOptions);
      if (response.status !== 204) throw unexpectedResponse(response.status);
    }
  };
}
