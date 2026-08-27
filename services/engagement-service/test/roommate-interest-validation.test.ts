import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseRoommateInterestId,
  validateCreateRoommateInterestBody,
  validateRoommateInterestCollectionQuery,
  validateRoommateInterestPageQuery
} from "../src/modules/roommate/validations/roommate-interest-validation.js";

test("normalizes the required first interest message and parses collection filters", () => {
  assert.deepEqual(validateCreateRoommateInterestBody({ message: "  Xin chào\r\nBạn nhé.  " }), {
    message: "Xin chào\nBạn nhé."
  });
  assert.deepEqual(validateRoommateInterestCollectionQuery({ direction: "outgoing", status: "pending" }), {
    direction: "OUTGOING",
    status: "PENDING",
    page: 1,
    pageSize: 20,
    offset: 0
  });
  assert.deepEqual(validateRoommateInterestPageQuery({ page: "2", pageSize: "10" }), {
    page: 2,
    pageSize: 10,
    offset: 10
  });
  assert.equal(parseRoommateInterestId("42"), 42);
});

test("rejects blank, unsafe, overlong, unknown and invalid interest fields", () => {
  const validation = (operation: () => unknown, field: string) => {
    assert.throws(operation, (error: unknown) => {
      return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "VALIDATION_FAILED" &&
        "details" in error &&
        Array.isArray(error.details) &&
        error.details.some(
          (detail: unknown) =>
            typeof detail === "object" && detail !== null && "field" in detail && detail.field === field
        )
      );
    });
  };
  validation(() => validateCreateRoommateInterestBody({ message: " \t " }), "message");
  validation(() => validateCreateRoommateInterestBody({ message: "a\u0000" }), "message");
  validation(() => validateCreateRoommateInterestBody({ message: "a", extra: true }), "extra");
  validation(() => validateRoommateInterestCollectionQuery({ direction: "SIDEWAYS" }), "direction");
  validation(() => validateRoommateInterestCollectionQuery({ status: "PENDING" }), "direction");
  validation(() => validateRoommateInterestPageQuery({ pageSize: "51" }), "pageSize");
  validation(() => parseRoommateInterestId("0"), "interestId");
});
