import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboard } from "../app/dashboard.server.ts";
const event = { id: "event", name: "Social", startAt: new Date("2026-10-01T12:00:00Z"), discountCodes: '["CODE"]', attendees: [{ customerId: "customer", attended: true }] };
const order = (id, date, discountCodes = "[]") => ({ id, orderDate: new Date(date), customerId: "customer", total: 10, currency: "CAD", discountCodes });
test("timeline respects elapsed-day boundaries and reconciles to attributed orders", () => {
  const report = dashboard([event], [order("start", "2026-10-01T12:00:00Z"), order("next", "2026-10-02T12:00:00Z"), order("end", "2026-10-08T12:00:00Z")], 7, new Date("2026-10-10"));
  const row = report.rows[0];
  assert.equal(row.dailyOrders[0].orders, 1);
  assert.equal(row.dailyOrders[1].orders, 1);
  assert.equal(row.dailyOrders.reduce((sum, point) => sum + point.orders, 0), row.orders);
  assert.equal(row.orders, 2);
});
test("only the winning event receives a timeline purchase", () => {
  const newer = { ...event, id: "newer", startAt: new Date("2026-10-02T12:00:00Z"), discountCodes: "[]" };
  const report = dashboard([event, newer], [order("code", "2026-10-03T12:00:00Z", '["CODE"]')], 7, new Date("2026-10-04"));
  assert.equal(report.rows.find((row) => row.id === "event").dailyOrders[2].orders, 1);
  assert.equal(report.rows.find((row) => row.id === "newer").dailyOrders[1].orders, 0);
});
test("distinguishes partial and unreached days", () => {
  const row = dashboard([event], [], 7, new Date("2026-10-02T18:00:00Z")).rows[0];
  assert.equal(row.dailyOrders[0].complete, true);
  assert.equal(row.dailyOrders[1].started, true);
  assert.equal(row.dailyOrders[1].complete, false);
  assert.equal(row.dailyOrders[2].started, false);
});
