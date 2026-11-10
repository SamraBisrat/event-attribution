import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboard } from "../app/dashboard.server.ts";
const event = (id, date, discountCodes = []) => ({ id, name: id, startAt: new Date(date), discountCodes: JSON.stringify(discountCodes), attendees: [{ customerId: "customer", attended: true }] });
const order = (id, discountCodes = [], customerId = "customer") => ({ id, customerId, orderDate: new Date("2026-10-20"), total: 20, currency: "CAD", discountCodes: JSON.stringify(discountCodes) });
const now = new Date("2026-11-02");
test("most recent attendance gets credit once across multiple events", () => {
  const report = dashboard([event("older", "2026-10-01"), event("recent", "2026-10-15")], [order("one")], 30, now);
  assert.equal(report.rows[0].id, "recent");
  assert.equal(report.rows.reduce((sum, row) => sum + row.orders, 0), 1);
  assert.equal(report.uniqueBuyers, 1);
  assert.equal(report.uniqueAttendees, 1);
});
test("case insensitive code overrides attendance and allows nonattendees", () => {
  const report = dashboard([event("older", "2026-10-01", ["CODE"]), event("recent", "2026-10-15")], [order("one", ["code"], "outsider")], 30, now);
  assert.equal(report.rows[0].id, "older");
  assert.equal(report.rows[0].outsideAttendeeOrders, 1);
  assert.equal(report.rows[0].conversion, 0);
});
test("shared code matches are excluded rather than double counted", () => {
  const report = dashboard([event("first", "2026-10-01", ["CODE"]), event("second", "2026-10-15", ["CODE"])], [order("one", ["CODE"])], 30, now);
  assert.equal(report.ambiguousOrders, 1);
  assert.equal(report.uniqueBuyers, 0);
});
test("window excludes late orders and spending stays separate by currency", () => {
  const report = dashboard([event("first", "2026-10-01")], [order("one"), { ...order("two"), currency: "USD" }], 7, now);
  assert.equal(report.rows[0].orders, 0);
  assert.equal(report.journeys[0].spending.CAD.after, 20);
  assert.equal(report.journeys[0].spending.USD.after, 20);
  assert.equal(report.journeys[0].afterPeriodComplete, false);
});
