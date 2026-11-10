import { test } from "node:test";
import assert from "node:assert/strict";
import { attendeeSales } from "../app/attendee-sales.ts";
import { eventInput } from "../app/event-input.server.ts";
const attendee = { customerId: "person", attended: true, customer: { email: "person@example.com", shopifyCustomerId: "remote" } };
const event = (id, date, attendees = [attendee]) => ({ id, name: id, startAt: new Date(date), endAt: null, attendees });
const sale = (id, date, total = 10, currency = "CAD") => ({ id, shopifyOrderId: id, orderDate: new Date(date), customerId: "person", total, currency });
test("all past events combines a repeat attendee once and does not duplicate their purchases", () => {
  const purchase = sale("one", "2026-10-03");
  const rows = attendeeSales([event("first", "2026-10-01"), event("second", "2026-10-02"), event("future", "2027-01-01")], [sale("before", "2026-09-01"), purchase, purchase, sale("refund", "2026-10-04", 0)], "", new Date("2026-11-01"));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].events, ["first", "second"]);
  assert.equal(rows[0].purchases.length, 1);
  assert.deepEqual(rows[0].revenue, { CAD: 10 });
});
test("event selection uses its own start date, excludes unconfirmed people, and separates currencies", () => {
  const rows = attendeeSales([event("first", "2026-10-01"), event("second", "2026-10-05"), event("absent", "2026-10-01", [{ ...attendee, attended: false }])], [sale("earlier", "2026-10-03"), sale("later", "2026-10-06"), sale("usd", "2026-10-07", 20, "USD")], "second", new Date("2026-11-01"));
  assert.equal(rows[0].purchases.length, 2);
  assert.deepEqual(rows[0].revenue, { CAD: 10, USD: 20 });
  assert.equal(attendeeSales([event("absent", "2026-10-01", [{ ...attendee, attended: false }])], [], "", new Date("2026-11-01")).length, 0);
});
test("locations are optional, normalized and length limited", () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: "Event", eventType: "Social", startAt: "2026-10-01", location: "  Toronto studio  " })) form.set(key, value);
  assert.equal(eventInput(form).location, "Toronto studio");
  form.set("location", "x".repeat(301));
  assert.throws(() => eventInput(form));
});
