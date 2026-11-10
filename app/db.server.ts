import { PrismaClient } from "@prisma/client";
import { encryptedDatabase } from "./security/encrypted-db.server";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

if (process.env.NODE_ENV !== "production" && !process.env.APP_DATA_KEY && existsSync(".env")) loadEnvFile(".env");

declare global {
  // eslint-disable-next-line no-var
  var encryptedPrismaGlobal: PrismaClient | undefined;
}

const prisma = global.encryptedPrismaGlobal ?? encryptedDatabase(new PrismaClient(), process.env.APP_DATA_KEY) as unknown as PrismaClient;
if (process.env.NODE_ENV !== "production") global.encryptedPrismaGlobal = prisma;

export default prisma;
