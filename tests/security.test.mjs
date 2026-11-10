import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { dataCipher } from "../app/security/crypto.server.ts";
import { encryptedDatabase } from "../app/security/encrypted-db.server.ts";
import { protectResponse } from "../app/security/headers.server.ts";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";

test("AES-GCM authenticates fields, rejects tampering/wrong keys, and randomizes ciphertext", () => {
  const cipher = dataCipher(randomBytes(32).toString("base64"));
  const encrypted = cipher.encrypt("person@example.com", "Customer.email");
  assert.equal(cipher.decrypt(encrypted, "Customer.email"), "person@example.com");
  assert.notEqual(encrypted, cipher.encrypt("person@example.com", "Customer.email"));
  assert.throws(() => cipher.decrypt(encrypted, "Session.email"));
  assert.throws(() => dataCipher(randomBytes(32).toString("base64")).decrypt(encrypted, "Customer.email"));
  assert.throws(() => cipher.decrypt(encrypted.slice(0, -4) + "AAAA", "Customer.email"));
  assert.throws(() => cipher.decrypt("plaintext", "Customer.email"));
  assert.throws(() => dataCipher(undefined));
});

test("protected responses prevent caching and retain Shopify framing policy", () => {
  const headers = new Headers({ "Content-Security-Policy": "frame-ancestors https://admin.shopify.com" });
  protectResponse(headers);
  assert.equal(headers.get("Cache-Control"), "private, no-store");
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(headers.get("Content-Security-Policy"), /admin.shopify.com/);
});

test("database encryption covers writes, nested reads, tokens, and transactions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "security-test-"));
  const raw = new PrismaClient({ datasourceUrl: `file:${join(directory, "test.sqlite")}` });
  const secure = encryptedDatabase(raw, randomBytes(32).toString("base64"));
  try {
    const migrations = new URL("../prisma/migrations/", import.meta.url);
    for (const entry of (await readdir(migrations, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((first, second) => first.name.localeCompare(second.name))) {
      const sql = await readFile(new URL(`${entry.name}/migration.sql`, migrations), "utf8");
      for (const statement of sql.split(";").filter((part) => part.trim())) await raw.$executeRawUnsafe(statement);
    }
    const customer = await secure.customer.create({ data: { shop: "one", shopifyCustomerId: "remote", email: "person@example.com" } });
    assert.equal(customer.email, "person@example.com");
    assert.match((await raw.customer.findUnique({ where: { id: customer.id } })).email, /^enc:v1:/);
    await secure.$transaction(async (transaction) => {
      await transaction.customer.update({ where: { id: customer.id }, data: { email: { set: "new@example.com" } } });
    });
    const event = await secure.event.create({ data: { shop: "one", name: "Test", eventType: "Test", startAt: new Date() } });
    await secure.eventAttendee.create({ data: { eventId: event.id, customerId: customer.id } });
    const nested = await secure.event.findUnique({ where: { id: event.id }, include: { attendees: { include: { customer: true } } } });
    assert.equal(nested.attendees[0].customer.email, "new@example.com");
    const sessionData = { id: "session", shop: "one", state: "state", isOnline: false, accessToken: "secret", refreshToken: "refresh-secret", email: "staff@example.com", firstName: "First", lastName: "Last" };
    await secure.session.upsert({ where: { id: "session" }, create: sessionData, update: sessionData });
    const storedSession = await raw.session.findUnique({ where: { id: "session" } });
    for (const field of ["accessToken", "refreshToken", "email", "firstName", "lastName"]) assert.match(storedSession[field], /^enc:v1:/);
    assert.equal((await secure.session.findUnique({ where: { id: "session" } })).accessToken, "secret");
    const storage = new PrismaSessionStorage(secure);
    const loaded = await storage.loadSession("session");
    assert.equal(loaded.accessToken, "secret");
    await storage.storeSession(loaded);
    assert.equal((await storage.loadSession("session")).accessToken, "secret");
    assert.match((await raw.session.findUnique({ where: { id: "session" } })).accessToken, /^enc:v1:/);
    await assert.rejects(secure.customer.findMany({ where: { email: "new@example.com" } }));
    await assert.rejects(secure.$queryRawUnsafe('SELECT email FROM "Customer"'));
    await assert.rejects(secure.event.create({ data: { shop: "one", name: "Nested", eventType: "Test", startAt: new Date(), attendees: { create: { customer: { create: { shop: "one", shopifyCustomerId: "nested", email: "plain@example.com" } } } } } }));
    await raw.customer.update({ where: { id: customer.id }, data: { email: "plaintext" } });
    await assert.rejects(secure.customer.findUnique({ where: { id: customer.id } }));
  } finally { await raw.$disconnect(); await rm(directory, { recursive: true, force: true }); }
});
