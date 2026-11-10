import { test } from "node:test";
import assert from "node:assert/strict";
import { eventInput } from "../app/event-input.server.ts";

function form(overrides = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ name: "Workshop", eventType: "Social", startAt: "2026-11-03T15:00:00.000Z", codes: " welcome, WELCOME, VIP ", ...overrides })) result.set(key, value);
  return result;
}
test("normalizes codes and preserves explicit timezone", () => {
  const result = eventInput(form());
  assert.deepEqual(JSON.parse(result.discountCodes), ["WELCOME", "VIP"]);
  assert.equal(result.startAt.toISOString(), "2026-11-03T15:00:00.000Z");
  assert.equal(result.endAt, null);
  assert.equal(result.cost, 0);
});
test("rejects invalid event details", () => {
  for (const invalid of [{ name: " " }, { eventType: "" }, { startAt: "bad" }, { endAt: "2026-11-02" }, { cost: "-1" }, { cost: "Infinity" }, { cost: "bad" }]) assert.throws(() => eventInput(form(invalid)));
});
test("limits code length and count", () => {
  assert.throws(() => eventInput(form({ codes: "A".repeat(101) })));
  assert.throws(() => eventInput(form({ codes: Array.from({ length: 21 }, (_, index) => `CODE${index}`).join(",") })));
});
