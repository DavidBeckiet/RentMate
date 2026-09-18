import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCreateReportBody,
  validateReportCollectionQuery,
  validateUpdateReportStatusBody
} from "../src/modules/reports/validations/report-validation.js";

test("normalizes a valid tenant report and admin collection query", () => {
  assert.deepEqual(validateCreateReportBody({ category: "fraud", details: "  Yêu cầu chuyển cọc ngoài hệ thống.  " }), {
    category: "FRAUD",
    details: "Yêu cầu chuyển cọc ngoài hệ thống."
  });
  assert.deepEqual(
    validateReportCollectionQuery({ status: "investigating", category: "image_incorrect", page: "2", pageSize: "15" }),
    {
      status: "INVESTIGATING",
      category: "IMAGE_INCORRECT",
      page: 2,
      pageSize: 15,
      offset: 15
    }
  );
});

test("requires terminal resolution notes and rejects unknown fields", () => {
  assert.throws(() => validateUpdateReportStatusBody({ status: "RESOLVED" }), /invalid data/i);
  assert.throws(() => validateCreateReportBody({ category: "FRAUD", screenshot: "private" }), /invalid data/i);
});

test("accepts direct terminal decisions and rejects new investigation updates", () => {
  assert.deepEqual(validateUpdateReportStatusBody({ status: "resolved", note: "  Đã xem xét.  " }), {
    status: "RESOLVED",
    note: "Đã xem xét."
  });
  assert.throws(() => validateUpdateReportStatusBody({ status: "INVESTIGATING" }), /invalid data/i);
  assert.throws(() => validateCreateReportBody({ category: "OTHER" }), /invalid data/i);
});
