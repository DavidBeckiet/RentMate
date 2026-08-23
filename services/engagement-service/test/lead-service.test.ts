import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type {
  LandlordLead,
  LeadNoteState,
  LeadReminderState,
  LeadRepository
} from "../src/modules/leads/repositories/lead-repository.js";
import { createLeadService } from "../src/modules/leads/services/lead-service.js";

const landlord: AuthenticatedPrincipal = Object.freeze({ userId: 20, role: "LANDLORD" });
const otherLandlord: AuthenticatedPrincipal = Object.freeze({ userId: 21, role: "LANDLORD" });
const tenant: AuthenticatedPrincipal = Object.freeze({ userId: 10, role: "TENANT" });
const createdAt = "2026-08-23T00:00:00.000Z";
const now = "2026-08-24T00:00:00.000Z";

function harness() {
  const notes = new Map<number, LeadNoteState>();
  const reminders = new Map<number, LeadReminderState>();
  const lead: LandlordLead = Object.freeze({
    inquiryId: 7,
    listingId: 42,
    status: "NEW",
    contactPhone: "+84901234567",
    preferredContactAt: null,
    createdAt,
    updatedAt: createdAt,
    lastMessage: Object.freeze({ senderRole: "TENANT", snippet: "Mình muốn xem phòng.", createdAt }),
    needsReply: true,
    hasUnreadTenantMessages: true,
    note: null,
    noteUpdatedAt: null,
    reminderAt: null,
    reminderUpdatedAt: null
  });
  const executor: SqlExecutor = {
    query: async () => {
      throw new Error("SQL is not used by this test.");
    }
  };
  const repository: LeadRepository = {
    async list(_executor, ownerId, view) {
      if (ownerId !== landlord.userId) return [];
      return view === "CLOSED" ? [] : [lead];
    },
    async lockOwnedInquiry(_executor, ownerId, inquiryId) {
      return ownerId === landlord.userId && inquiryId === lead.inquiryId;
    },
    async upsertNote(_executor, _ownerId, inquiryId, note) {
      const state = Object.freeze({ inquiryId, note, updatedAt: createdAt });
      notes.set(inquiryId, state);
      return state;
    },
    async deleteNote(_executor, _ownerId, inquiryId) {
      notes.delete(inquiryId);
    },
    async upsertReminder(_executor, _ownerId, inquiryId, remindAt) {
      const state = Object.freeze({ inquiryId, remindAt, updatedAt: now });
      reminders.set(inquiryId, state);
      return state;
    },
    async deleteReminder(_executor, _ownerId, inquiryId) {
      reminders.delete(inquiryId);
    }
  };
  return {
    service: createLeadService({
      repository,
      transactionRunner: { run: (operation) => operation(executor) },
      now: () => new Date(now)
    }),
    notes,
    reminders
  };
}

const query = Object.freeze({ view: "NEEDS_REPLY" as const, page: 1, pageSize: 20, offset: 0 });

test("lists the owning landlord queue with reply and unread signals", async () => {
  const subject = harness();
  const page = await subject.service.list(landlord, query);
  assert.equal(page.data.length, 1);
  assert.equal(page.data[0]?.needsReply, true);
  assert.equal(page.data[0]?.hasUnreadTenantMessages, true);
  assert.equal(page.hasNextPage, false);
  await assert.rejects(
    () => subject.service.list(tenant, query),
    (error: unknown) => error instanceof ApplicationError && error.code === "FORBIDDEN"
  );
});

test("stores and removes a private note only for the owning landlord", async () => {
  const subject = harness();
  const saved = await subject.service.saveNote(landlord, 7, { note: "Gọi lại sau 18 giờ." });
  assert.equal(saved.note, "Gọi lại sau 18 giờ.");
  assert.equal(subject.notes.get(7)?.note, saved.note);
  const removed = await subject.service.saveNote(landlord, 7, { note: null });
  assert.equal(removed.note, null);
  assert.equal(subject.notes.has(7), false);
  await assert.rejects(
    () => subject.service.saveNote(otherLandlord, 7, { note: "Không được phép." }),
    (error: unknown) => error instanceof ApplicationError && error.code === "RESOURCE_NOT_FOUND"
  );
});

test("schedules and clears one owner-only follow-up reminder", async () => {
  const subject = harness();
  const remindAt = "2026-08-25T09:30:00.000Z";
  const saved = await subject.service.saveReminder(landlord, 7, { remindAt });
  assert.equal(saved.remindAt, remindAt);
  assert.equal(subject.reminders.get(7)?.remindAt, remindAt);
  const removed = await subject.service.saveReminder(landlord, 7, { remindAt: null });
  assert.equal(removed.remindAt, null);
  assert.equal(subject.reminders.has(7), false);
  await assert.rejects(
    () => subject.service.saveReminder(otherLandlord, 7, { remindAt }),
    (error: unknown) => error instanceof ApplicationError && error.code === "RESOURCE_NOT_FOUND"
  );
});

test("rejects reminders outside the future 365-day window before writing", async () => {
  const subject = harness();
  await assert.rejects(
    () => subject.service.saveReminder(landlord, 7, { remindAt: now }),
    (error: unknown) => error instanceof ApplicationError && error.code === "VALIDATION_FAILED"
  );
  await assert.rejects(
    () => subject.service.saveReminder(landlord, 7, { remindAt: "2027-08-25T00:00:00.000Z" }),
    (error: unknown) => error instanceof ApplicationError && error.code === "VALIDATION_FAILED"
  );
  assert.equal(subject.reminders.size, 0);
});
