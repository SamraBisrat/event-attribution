import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";

const url = process.env.DATABASE_URL;
if (!url?.startsWith("file:/")) throw new Error("Container DATABASE_URL must use an absolute SQLite path on a persistent disk.");
const path = url.slice(5);
await mkdir(dirname(path), { recursive: true, mode: 0o700 });
const file = await open(path, "a", 0o600);
await file.close();
