import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { removeEventRecord, removeAttendeeRecord } from "../app/event-removal.server.ts";
import { updateEventRecord } from "../app/event-update.server.ts";
import { eventInput } from "../app/event-input.server.ts";

test("removals isolate stores and preserve customers, orders, and other registrations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "event-removal-"));
  const db = new PrismaClient({ datasourceUrl: `file:${join(directory, "test.sqlite")}` });
  try {
    const migrations = new URL("../prisma/migrations/", import.meta.url);
    for (const entry of (await readdir(migrations, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((first, second) => first.name.localeCompare(second.name))) {
      const sql = await readFile(new URL(`${entry.name}/migration.sql`, migrations), "utf8");
      for (const statement of sql.split(";").filter((part) => part.trim())) await db.$executeRawUnsafe(statement);
    }
    const first = await db.event.create({ data: { shop: "one", name: "First", eventType: "Social", startAt: new Date() } });
    const second = await db.event.create({ data: { shop: "one", name: "Second", eventType: "Social", startAt: new Date() } });
    const customer = await db.customer.create({ data: { shop: "one", shopifyCustomerId: "customer" } });
    const attendee = await db.eventAttendee.create({ data: { eventId: first.id, customerId: customer.id, attended: true } });
    await db.eventAttendee.create({ data: { eventId: second.id, customerId: customer.id, attended: true } });
    const order = await db.order.create({ data: { shop: "one", shopifyOrderId: "order", customerId: customer.id, orderDate: new Date(), total: 10, currency: "CAD" } });
    await db.attribution.create({ data: { eventId: first.id, customerId: customer.id, orderId: order.id, attributionType: "attendance", attributedRevenue: 10 } });
    const form = new FormData();
    for (const [key, value] of Object.entries({ name: "Updated event", location: "Toronto", eventType: "Workshop", startAt: "2026-11-01T14:30:00.000Z", endAt: "2026-11-01T16:00:00.000Z", cost: "25", description: "Updated details", codes: "new10, NEW10" })) form.set(key, value);
    const changes = eventInput(form);
    assert.equal(await updateEventRecord(db, "other", first.id, changes), false);
    assert.equal(await updateEventRecord(db, "one", "missing", changes), false);
    assert.equal((await db.event.findUnique({ where: { id: first.id } })).name, "First");
    assert.equal(await updateEventRecord(db, "one", first.id, changes), true);
    const updated = await db.event.findUnique({ where: { id: first.id } });
    for (const [key, value] of Object.entries(changes)) assert.deepEqual(updated[key], value);
    assert.equal(updated.shop, "one");
    assert.equal(await db.eventAttendee.count(), 2);
    assert.equal(await db.attribution.count(), 1);
    assert.deepEqual(await db.order.findUnique({ where: { id: order.id } }), order);
    assert.equal((await db.event.findUnique({ where: { id: second.id } })).name, "Second");
    form.set("location", ""); form.set("endAt", ""); form.set("codes", "");
    assert.equal(await updateEventRecord(db, "one", first.id, eventInput(form)), true);
    const cleared = await db.event.findUnique({ where: { id: first.id } });
    assert.equal(cleared.location, null);
    assert.equal(cleared.endAt, null);
    assert.equal(cleared.discountCodes, "[]");
    assert.equal(await removeEventRecord(db, "other", first.id), false);
    assert.equal(await removeAttendeeRecord(db, "other", first.id, attendee.id), false);
    assert.equal(await removeAttendeeRecord(db, "one", second.id, attendee.id), false);
    assert.equal(await removeAttendeeRecord(db, "one", first.id, attendee.id), true);
    assert.equal(await db.attribution.count(), 0);
    assert.equal(await db.eventAttendee.count(), 1);
    assert.equal(await removeAttendeeRecord(db, "one", first.id, attendee.id), false);
    assert.equal(await removeEventRecord(db, "one", second.id), true);
    assert.equal(await db.eventAttendee.count(), 0);
    assert.equal(await db.customer.count(), 1);
    assert.equal(await db.order.count(), 1);
    assert.equal(await db.event.count(), 1);
    assert.equal(await removeEventRecord(db, "one", second.id), false);
    assert.equal(await removeEventRecord(db, "one", ""), false);
  } finally {
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
