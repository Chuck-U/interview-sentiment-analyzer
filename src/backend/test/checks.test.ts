import assert from "node:assert/strict";
import test from "node:test";

import {
  isInRecord,
  isNonEmptyArray,
  isNonEmptyNumber,
  isNonEmptyObject,
  isNonEmptyString,
} from "../guards/checks";

test("isNonEmptyString accepts non-empty trimmed strings", () => {
  assert.equal(isNonEmptyString("hello"), true);
  assert.equal(isNonEmptyString("  x  "), true);
});

test("isNonEmptyString rejects empty, whitespace-only, and non-strings", () => {
  assert.equal(isNonEmptyString(""), false);
  assert.equal(isNonEmptyString("   \t\n"), false);
  assert.equal(isNonEmptyString(null), false);
  assert.equal(isNonEmptyString(undefined), false);
  assert.equal(isNonEmptyString(NaN), false);
  assert.equal(isNonEmptyString(0), false);
  assert.equal(isNonEmptyString(42), false);
  assert.equal(isNonEmptyString(true), false);
  assert.equal(isNonEmptyString({}), false);
  assert.equal(isNonEmptyString([]), false);
});

test("isNonEmptyArray accepts arrays with at least one element", () => {
  assert.equal(isNonEmptyArray([0]), true);
  assert.equal(isNonEmptyArray([null]), true);
  assert.equal(isNonEmptyArray([undefined]), true);
  assert.equal(isNonEmptyArray(["a", "b"]), true);
  // Length-only check: sparse `new Array(n)` has length n but no indexed values.
  assert.equal(isNonEmptyArray(new Array(3)), true);
});

test("isNonEmptyArray rejects empty arrays and non-arrays", () => {
  assert.equal(isNonEmptyArray([]), false);
  assert.equal(isNonEmptyArray(new Array(0)), false);
  assert.equal(isNonEmptyArray(null), false);
  assert.equal(isNonEmptyArray(undefined), false);
  assert.equal(isNonEmptyArray(NaN), false);
  assert.equal(isNonEmptyArray("array"), false);
  assert.equal(isNonEmptyArray({ length: 1 }), false);
  assert.equal(isNonEmptyArray({ 0: "x" }), false);
});

test("isNonEmptyObject accepts plain objects with own string keys", () => {
  assert.equal(isNonEmptyObject({ a: 1 }), true);
  assert.equal(isNonEmptyObject({ "": true }), true);
});

test("isNonEmptyObject rejects empty objects, null, arrays, and non-objects", () => {
  assert.equal(isNonEmptyObject({}), false);
  assert.equal(isNonEmptyObject(null), false);
  assert.equal(isNonEmptyObject(undefined), false);
  assert.equal(isNonEmptyObject(NaN), false);
  assert.equal(isNonEmptyObject([]), false);
  assert.equal(isNonEmptyObject(""), false);
  assert.equal(isNonEmptyObject(0), false);
  assert.equal(isNonEmptyObject(new Map([["a", 1]])), false);
});

test("isNonEmptyNumber accepts finite numbers greater than zero", () => {
  assert.equal(isNonEmptyNumber(1), true);
  assert.equal(isNonEmptyNumber(0.5), true);
  assert.equal(isNonEmptyNumber(Number.MAX_VALUE), true);
  assert.equal(isNonEmptyNumber(Infinity), true);
});

test("isNonEmptyNumber rejects zero, negative, NaN, non-numbers, null, and undefined", () => {
  assert.equal(isNonEmptyNumber(0), false);
  assert.equal(isNonEmptyNumber(-1), false);
  assert.equal(isNonEmptyNumber(-0), false);
  assert.equal(isNonEmptyNumber(NaN), false);
  assert.equal(isNonEmptyNumber(null), false);
  assert.equal(isNonEmptyNumber(undefined), false);
  assert.equal(isNonEmptyNumber("1"), false);
  assert.equal(isNonEmptyNumber(""), false);
  assert.equal(isNonEmptyNumber({}), false);
  assert.equal(isNonEmptyNumber(Object(2)), false);
});

test("isInRecord accepts string keys present on the record object", () => {
  const record = { a: 1, b: 2 } as Record<string, number>;
  assert.equal(isInRecord("a", record), true);
  assert.equal(isInRecord("b", record), true);
});

test("isInRecord rejects missing keys and non-strings", () => {
  const record = { a: 1, b: 2 } as Record<string, number>;
  assert.equal(isInRecord("c", record), false);
  assert.equal(isInRecord("", record), false);
  assert.equal(isInRecord(null, record), false);
  assert.equal(isInRecord(undefined, record), false);
  assert.equal(isInRecord(NaN, record), false);
  assert.equal(isInRecord(1, record), false);
  assert.equal(isInRecord(["a"], record), false);
});
