import { randomBytes } from "node:crypto";
import { readFile, writeFile, chmod, mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { dataCipher, protectedFields } from "../app/security/crypto.server.ts";

if (!process.argv.includes("--maintenance-confirmed")) throw new Error("Stop every app process, then rerun with --maintenance-confirmed. See SECURITY.md.");
const root = new URL("../", import.meta.url);
if (process.env.DATABASE_URL !== "file:dev.sqlite") throw new Error("This maintenance script only supports the local dev.sqlite database. See SECURITY.md.");
const db = new PrismaClient();
try {
  const rows = { Customer: await db.customer.findMany(), Session: await db.session.findMany() };
  let key = process.env.APP_DATA_KEY;
  if (!key) {
    if (Object.entries(rows).some(([model, records]) => records.some((record) => protectedFields[model].some((field) => typeof record[field] === "string" && record[field].startsWith("enc:v1:"))))) throw new Error("Encrypted records exist. Restore the original APP_DATA_KEY; do not generate a replacement.");
    const envPath = new URL(".env", root);
    const existing = await readFile(envPath, "utf8").catch((error) => { if (error.code === "ENOENT") return ""; throw error; });
    if (/^\s*APP_DATA_KEY\s*=/m.test(existing)) throw new Error("Load the existing .env key before migrating.");
    key = randomBytes(32).toString("base64");
    await writeFile(envPath, `${existing}\nAPP_DATA_KEY=${key}\n`, { mode: 0o600 });
    await chmod(envPath, 0o600);
  }
  const cipher = dataCipher(key);
  await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
  const snapshot = await readFile(new URL("prisma/dev.sqlite", root));
  const backupDir = new URL(".security-backups/", root);
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  await writeFile(new URL(`database-${Date.now()}.enc`, backupDir), cipher.encrypt(snapshot.toString("base64"), "database-backup"), { mode: 0o600 });
  await db.$queryRawUnsafe("PRAGMA secure_delete = ON");
  const updates = [];
  for (const [model, records] of Object.entries(rows)) {
    for (const record of records) {
      const data = {};
      for (const field of protectedFields[model]) {
        const value = record[field];
        if (value === null || value === undefined) continue;
        if (value.startsWith("enc:v1:")) cipher.decrypt(value, `${model}.${field}`);
        else data[field] = cipher.encrypt(value, `${model}.${field}`);
      }
      if (Object.keys(data).length) updates.push(db[model === "Customer" ? "customer" : "session"].update({ where: { id: record.id }, data }));
    }
  }
  await db.$transaction(updates);
  await db.$executeRawUnsafe("VACUUM");
  await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
  await chmod(new URL("prisma/dev.sqlite", root), 0o600);
  console.log(`Encrypted ${updates.length} records. An encrypted backup was saved. Keep APP_DATA_KEY backed up securely; never commit or share it.`);
} catch {
  console.error("Encryption maintenance failed. Keep the existing key and backup. Check configuration before retrying; sensitive details were omitted.");
  process.exitCode = 1;
} finally { await db.$disconnect(); }
