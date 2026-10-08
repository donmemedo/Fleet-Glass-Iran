import assert from "node:assert/strict";
import test from "node:test";
import { quote } from "../app/quote.ts";

test("quote", () => {
  const q = quote(100, 20);
  assert.equal(q.cracked, 20);
  assert.ok(q.saved > 0 && q.with < q.without);
  // Break-even is near a 10% crack rate: below it, checks cost more than they save, and the UI says so.
  assert.equal(quote(100, 5).saved, 0);
  assert.ok(quote(100, 11).saved > 0);
});
