import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { syncOrders, syncQuery } from "../app/sync-orders.server.ts";
test("history filters honor scope and overlap incremental updates", () => {
  assert.equal(syncQuery(true, null, new Date("2026-11-09")), "");
  assert.match(syncQuery(false, null, new Date("2026-11-09")), /created_at:>=/);
  assert.equal(syncQuery(true, new Date("2026-11-09T12:00:00Z"), new Date()), "updated_at:>=2026-11-09T11:55:00.000Z");
});
test("sync paginates, upserts, scopes shops, and keeps data on API failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "order-sync-"));
  const db = new PrismaClient({ datasourceUrl: `file:${join(directory, "test.sqlite")}` });
  try {
    const migrations = new URL("../prisma/migrations/", import.meta.url);
    for (const entry of (await readdir(migrations, { withFileTypes: true })).filter((item) => item.isDirectory()).sort((first, second) => first.name.localeCompare(second.name))) {
      const sql = await readFile(new URL(`${entry.name}/migration.sql`, migrations), "utf8");
      for (const statement of sql.split(";").filter((part) => part.trim())) await db.$executeRawUnsafe(statement);
    }
    const order = { id: "remote", createdAt: new Date().toISOString(), customer: { id: "customer" }, test: false, cancelledAt: null, displayFinancialStatus: "PAID", currentTotalPriceSet: { shopMoney: { amount: "20", currencyCode: "CAD" } } };
    let calls = 0;
    const admin = { graphql: async (_, { variables }) => { calls++; return Response.json({ data: { orders: { nodes: variables.after ? [] : [order], pageInfo: { hasNextPage: !variables.after, endCursor: variables.after ? null : "next" } } } }); } };
    await syncOrders(db, admin, "one", "read_orders");
    assert.equal(calls, 2);
    await syncOrders(db, admin, "one", "read_orders");
    assert.equal(calls, 2);
    await db.orderSyncState.update({ where: { shop: "one" }, data: { lastSuccessAt: new Date(0) } });
    order.currentTotalPriceSet.shopMoney.amount = "15";
    await syncOrders(db, admin, "one", "read_orders");
    assert.equal(await db.order.count(), 1);
    assert.equal((await db.order.findFirst()).total, 15);
    await syncOrders(db, admin, "two", "read_orders");
    assert.equal(await db.order.count(), 2);
    await db.orderSyncState.update({ where: { shop: "one" }, data: { lastSuccessAt: new Date(0) } });
    await assert.rejects(syncOrders(db, { graphql: async () => Response.json({ errors: [{ message: "denied" }] }) }, "one", "read_orders"));
    assert.equal((await db.orderSyncState.findUnique({ where: { shop: "one" } })).lastSuccessAt.getTime(), 0);
    assert.equal(await db.order.count(), 2);
    await assert.rejects(syncOrders(db, admin, "three", "read_customers"));
  } finally { await db.$disconnect(); await rm(directory, { recursive: true, force: true }); }
});
