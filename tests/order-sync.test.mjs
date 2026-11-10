import { test } from "node:test";
import assert from "node:assert/strict";
import { orderValues } from "../app/order-sync.server.ts";
import { summarizeAttribution } from "../app/attribution.server.ts";

const paid = {
  id: "gid://shopify/Order/1", createdAt: "2026-11-01T00:00:00Z",
  customer: { id: "gid://shopify/Customer/1" }, cancelledAt: null, test: false,
  displayFinancialStatus: "PAID",
  currentTotalPriceSet: { shopMoney: { amount: "15.50", currencyCode: "CAD" } },
};

test("uses current totals and preserves currency for paid and partially refunded orders", () => {
  assert.equal(orderValues(paid).total, 15.5);
  assert.equal(orderValues({ ...paid, displayFinancialStatus: "PARTIALLY_REFUNDED" }).total, 15.5);
  assert.equal(orderValues(paid).currency, "CAD");
});

test("cancelled, test, unpaid and refunded orders reset previously stored revenue", () => {
  for (const changes of [{ cancelledAt: paid.createdAt }, { test: true },
    { displayFinancialStatus: "PENDING" }, { displayFinancialStatus: "REFUNDED" },
    { displayFinancialStatus: "VOIDED" }]) {
    const values = orderValues({ ...paid, ...changes });
    assert.equal(values.total, 0);
    const report = summarizeAttribution(new Date(paid.createdAt), [{ customerId: "local", attended: true }],
      [{ id: "order", customerId: "local", ...values }], 30);
    assert.equal(report.customersWhoPurchased, 0);
    assert.equal(report.attributedOrders, 0);
  }
});

test("rejects invalid totals and dates before persistence", () => {
  assert.throws(() => orderValues({ ...paid, createdAt: "bad" }));
  assert.throws(() => orderValues({ ...paid, currentTotalPriceSet: { shopMoney: { amount: "bad", currencyCode: "CAD" } } }));
});

test("confirming and undoing attendance changes attribution", () => {
  const orders = [{ id: "order", customerId: "local", ...orderValues(paid) }];
  for (const attended of [false, true, false]) {
    const report = summarizeAttribution(new Date(paid.createdAt), [{ customerId: "local", attended }], orders, 30);
    assert.equal(report.customersWhoPurchased, attended ? 1 : 0);
  }
});
