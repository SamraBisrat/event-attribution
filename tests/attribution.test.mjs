import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeAttribution } from "../app/attribution.server.ts";

const startAt = new Date("2026-01-01T00:00:00Z");
const attendees = [
  { customerId: "confirmed", attended: true },
  { customerId: "registered", attended: false },
];
const order = (id, customerId, date, total = 10, currency = "CAD") =>
  ({ id, customerId, orderDate: new Date(date), total, currency });

test("includes start, excludes end, guests, and registrations without attendance", () => {
  const result = summarizeAttribution(startAt, attendees, [
    order("start", "confirmed", "2026-01-01"),
    order("before", "confirmed", "2025-12-31"),
    order("end", "confirmed", "2026-01-31"),
    order("absent", "registered", "2026-01-02"),
    order("guest", null, "2026-01-02"),
  ], 30);
  assert.equal(result.attributedOrders, 1);
  assert.equal(result.totalRegistered, 2);
  assert.equal(result.conversionRate, 100);
});

test("deduplicates orders and purchasers and keeps currencies separate", () => {
  const first = order("first", "confirmed", "2026-01-02", 0.1);
  const result = summarizeAttribution(startAt, attendees, [first, first,
    order("second", "confirmed", "2026-01-02", 0.2),
    order("third", "confirmed", "2026-01-02", 5, "USD"),
  ], 30);
  assert.equal(result.customersWhoPurchased, 1);
  assert.equal(result.attributedOrders, 3);
  assert.deepEqual(result.revenueByCurrency, [{ currency: "CAD", amount: 0.3 }, { currency: "USD", amount: 5 }]);
});

test("empty event has zero conversion and no revenue", () => {
  const result = summarizeAttribution(startAt, [], [], 30);
  assert.equal(result.conversionRate, 0);
  assert.deepEqual(result.revenueByCurrency, []);
});
