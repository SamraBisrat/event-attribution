import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "csv-parse/sync";
import { dashboardCsv } from "../app/dashboard-csv.ts";
const row = { name: 'Social, "November"\nEvening', startAt: new Date("2026-11-01"), attendees: 10, buyers: 2, orders: 3, conversion: 20, revenue: { CAD: 22.5, USD: 10 }, codeOrders: 1, outsideAttendeeOrders: 0 };
test("CSV round trips names and includes the window and separate currencies", () => {
  const parsed = parse(dashboardCsv([row], 60), { columns: true, bom: true });
  assert.equal(parsed[0].Event, row.name);
  assert.equal(parsed[0]["Window (days)"], "60");
  assert.equal(parsed[0]["Revenue by currency"], "22.50 CAD; 10.00 USD");
  assert.match(parsed[0]["History coverage"], /Partial/);
});
test("CSV neutralizes spreadsheet formulas in event names", () => {
  for (const name of ["=1+1", "+SUM(A1)", "@SUM(A1)", "-1+1", "  =1+1"]) {
    const parsed = parse(dashboardCsv([{ ...row, name }], 30), { columns: true, bom: true });
    assert.equal(parsed[0].Event, `'${name}`);
  }
});
test("empty export retains a valid header", () => {
  assert.equal(parse(dashboardCsv([], 30), { bom: true }).length, 1);
});
