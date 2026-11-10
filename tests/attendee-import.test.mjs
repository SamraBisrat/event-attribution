import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { encryptedDatabase } from "../app/security/encrypted-db.server.ts";
import { importAttendees } from "../app/import-attendees.server.ts";
import { attendeeOrders } from "../app/customer-identity.server.ts";
import { syncOrders } from "../app/sync-orders.server.ts";
import { attendeeSales } from "../app/attendee-sales.ts";

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), "attendee-import-"));
  const raw = new PrismaClient({ datasourceUrl: `file:${join(directory, "test.sqlite")}` });
  const db = encryptedDatabase(raw, randomBytes(32).toString("base64"));
  try {
    const migrations = new URL("../prisma/migrations/", import.meta.url);
    for (const entry of (await readdir(migrations, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      for (const statement of (await readFile(new URL(`${entry.name}/migration.sql`, migrations), "utf8")).split(";").filter((part) => part.trim())) await raw.$executeRawUnsafe(statement);
    }
    const event = await db.event.create({ data: { shop: "one", name: "Workshop", eventType: "Workshop", startAt: new Date("2026-01-01") } });
    await run({ db, raw, event });
  } finally { await raw.$disconnect(); await rm(directory, { recursive: true, force: true }); }
}
const row = (event, email = "new@example.com") => ({ "Event ID": event.id, "First name": "New", "Last name": "Attendee", Email: email, "Phone number": "+1 416 555 0100" });
const remoteOrder = (email, id = "order", customer = { id: "remote", defaultEmailAddress: { emailAddress: email } }) => ({ id, email, createdAt: "2026-01-02T12:00:00Z", customer, test: false, cancelledAt: null, displayFinancialStatus: "PAID", discountCodes: [], currentTotalPriceSet: { shopMoney: { amount: "20", currencyCode: "CAD" } } });
const admin = (orders) => ({ graphql: async () => Response.json({ data: { orders: { nodes: orders, pageInfo: { hasNextPage: false, endCursor: null } } } }) });

test("imports new attendees without Shopify, encrypts contact details and makes repeat uploads idempotent", async () => fixture(async ({ db, raw, event }) => {
  const result = await importAttendees(db, "one", event.id, [row(event), row(event, " NEW@example.com "), { ...row(event), Email: "bad" }, { ...row(event), "Event ID": "wrong" }]);
  assert.equal(result.imported, 1); assert.equal(result.alreadyRegistered, 1);
  assert.equal(result.invalid.length, 1); assert.equal(result.eventMismatch.length, 1);
  const customer = await db.customer.findFirst();
  assert.equal(customer.shopifyCustomerId, null);
  assert.equal(customer.firstName, "New"); assert.equal(customer.phone, "+1 416 555 0100");
  const stored = await raw.customer.findFirst();
  for (const field of ["email", "firstName", "lastName", "phone"]) assert.match(stored[field], /^enc:v1:/);
  assert.equal((await db.eventAttendee.findFirst()).attended, true);
  const second = await db.event.create({ data: { shop: "one", name: "Second", eventType: "Workshop", startAt: new Date("2026-01-01") } });
  await importAttendees(db, "one", second.id, [{ ...row(second), "Phone number": "", "First name": "" }]);
  assert.equal(await db.customer.count(), 1); assert.equal(await db.eventAttendee.count(), 2);
  assert.equal((await db.customer.findFirst()).phone, customer.phone);
  await assert.rejects(importAttendees(db, "other", event.id, [row(event)]));
}));

test("later purchases appear on the original attendee without deleting customer or attendance records", async () => fixture(async ({ db, raw, event }) => {
  await importAttendees(db, "one", event.id, [row(event)]);
  const registration = await db.eventAttendee.findFirst();
  const local = await db.customer.findFirst();
  const priorRemote = await db.customer.create({ data: { shop: "one", shopifyCustomerId: "remote" } });
  await syncOrders(db, admin([remoteOrder("NEW@example.com")]), "one", "read_orders,read_all_orders");
  const orders = await attendeeOrders(db, "one");
  assert.equal(orders[0].customerId, local.id);
  assert.equal((await db.order.findFirst()).customerId, priorRemote.id);
  assert.equal(await db.customer.count(), 2);
  assert.deepEqual(await db.eventAttendee.findFirst(), registration);
  assert.match((await raw.order.findFirst()).email, /^enc:v1:/);
  const events = await db.event.findMany({ where: { shop: "one" }, include: { attendees: { include: { customer: true } } } });
  const sales = attendeeSales(events, orders, event.id, new Date("2026-02-01"));
  assert.equal(sales.length, 1); assert.equal(sales[0].purchases.length, 1); assert.equal(sales[0].revenue.CAD, 20);
  await db.orderSyncState.update({ where: { shop: "one" }, data: { lastSuccessAt: new Date(0) } });
  await syncOrders(db, admin([remoteOrder("new@example.com")]), "one", "read_orders,read_all_orders");
  assert.equal(await db.order.count(), 1); assert.equal(await db.eventAttendee.count(), 1);
}));

test("imports after sync link historical orders, guest orders match email, and stores stay isolated", async () => fixture(async ({ db, event }) => {
  await syncOrders(db, admin([remoteOrder("new@example.com"), remoteOrder("guest@example.com", "guest-order", null)]), "one", "read_orders,read_all_orders");
  await importAttendees(db, "one", event.id, [row(event), { ...row(event, "guest@example.com"), "Phone number": "" }]);
  const attendees = await db.eventAttendee.findMany({ include: { customer: true } });
  const orders = await attendeeOrders(db, "one");
  for (const order of orders) assert.equal(order.customerId, attendees.find((attendee) => attendee.customer.email === order.email).customerId);
  await syncOrders(db, admin([remoteOrder("guest@example.com", "other-order", null)]), "other", "read_orders,read_all_orders");
  assert.equal((await attendeeOrders(db, "other"))[0].customerId, null);
  assert.equal(await db.eventAttendee.count(), 2);
}));

test("shared email across distinct Shopify customer IDs never guesses an attendee match", async () => fixture(async ({ db, event }) => {
  await importAttendees(db, "one", event.id, [row(event)]);
  const local = await db.customer.findFirst();
  await syncOrders(db, admin([remoteOrder("new@example.com"), remoteOrder("new@example.com", "second", { id: "different" })]), "one", "read_orders,read_all_orders");
  for (const order of await attendeeOrders(db, "one")) assert.notEqual(order.customerId, local.id);
}));
