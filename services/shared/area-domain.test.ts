import assert from "node:assert/strict";
import test from "node:test";
import { areaMatches, areaSearchTerms, canonicalizeAreaInput, formatAreaLabel, matchAreaAlias } from "./area-domain.js";

test("normalizes supported Vietnamese area aliases without fuzzy matching", () => {
  for (const value of ["B\u00ecnh Th\u1ea1nh", "binh thanh", "BINH THANH", "b\u00ecnh-th\u1ea1nh", "binh_thanh"]) {
    assert.equal(canonicalizeAreaInput(value), "binh-thanh");
  }
  for (const value of ["Qu\u1eadn 3", "Quan 3", "quan-3", "Q3", "q.3"]) {
    assert.equal(canonicalizeAreaInput(value), "quan-3");
  }
  assert.equal(matchAreaAlias("b\u00ecnh th\u00e1ch"), null);
});

test("formats known slugs and supports bounded legacy matching", () => {
  assert.equal(formatAreaLabel("quan-3"), "Qu\u1eadn 3");
  assert.equal(formatAreaLabel("binh-thanh"), "B\u00ecnh Th\u1ea1nh");
  assert.equal(areaMatches("B\u00ecnh Th\u1ea1nh", "Binh Thanh"), true);
  assert.equal(areaMatches("Qu\u1eadn 3", "Quan 3"), true);
  assert.equal(areaMatches("Qu\u1eadn 3", "Qu\u1eadn 1"), false);
  assert.ok(areaSearchTerms("B\u00ecnh Th\u1ea1nh").includes("Binh Thanh"));
});
