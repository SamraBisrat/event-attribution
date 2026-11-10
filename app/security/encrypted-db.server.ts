import { Prisma, type PrismaClient } from "@prisma/client";
import { dataCipher, protectedFields } from "./crypto.server.ts";

export function encryptedDatabase(client: PrismaClient, key: string | undefined) {
  const cipher = dataCipher(key);
  const models = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
  function decryptResult(value: unknown, model: string): unknown {
    if (Array.isArray(value)) return value.map((item) => decryptResult(item, model));
    if (!value || typeof value !== "object") return value;
    const result = { ...value } as Record<string, unknown>;
    for (const field of protectedFields[model] ?? []) {
      if (typeof result[field] === "string") result[field] = cipher.decrypt(result[field] as string, `${model}.${field}`);
    }
    for (const field of models.get(model)?.fields ?? []) {
      if (field.kind === "object" && field.name in result) result[field.name] = decryptResult(result[field.name], field.type);
    }
    return result;
  }
  function encryptData(value: unknown, model: string): unknown {
    if (Array.isArray(value)) return value.map((item) => encryptData(item, model));
    if (!value || typeof value !== "object") return value;
    const data = { ...value } as Record<string, unknown>;
    for (const field of protectedFields[model] ?? []) {
      const original = data[field];
      if (original === undefined || original === null) continue;
      if (typeof original === "string") data[field] = cipher.encrypt(original, `${model}.${field}`);
      else if (typeof original === "object" && "set" in original && (typeof original.set === "string" || original.set === null)) {
        data[field] = { set: original.set === null ? null : cipher.encrypt(original.set, `${model}.${field}`) };
      } else throw new Error("Unsupported operation on a protected field.");
    }
    for (const field of models.get(model)?.fields ?? []) {
      if (field.kind === "object" && field.name in data) throw new Error("Nested database writes are disabled. Write protected records directly in a transaction.");
    }
    return data;
  }
  function rejectProtectedFilters(value: unknown, model: string): void {
    if (Array.isArray(value)) { value.forEach((item) => rejectProtectedFilters(item, model)); return; }
    if (!value || typeof value !== "object") return;
    for (const [field, child] of Object.entries(value)) {
      if ((protectedFields[model] ?? []).includes(field)) throw new Error("Filtering or sorting encrypted fields is unsupported. Use record IDs.");
      const relation = models.get(model)?.fields.find((item) => item.name === field && item.kind === "object");
      rejectProtectedFilters(child, relation?.type ?? model);
    }
  }
  return client.$extends({
    name: "encrypted-personal-data",
    query: {
      async $queryRaw() { throw new Error("Raw SQL is disabled on the application database client."); },
      async $queryRawUnsafe() { throw new Error("Raw SQL is disabled on the application database client."); },
      async $executeRaw() { throw new Error("Raw SQL is disabled on the application database client."); },
      async $executeRawUnsafe() { throw new Error("Raw SQL is disabled on the application database client."); },
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (["aggregate", "groupBy"].includes(operation) && protectedFields[model]) throw new Error("Aggregation on protected models is disabled.");
          const secured = { ...args } as Record<string, unknown>;
          rejectProtectedFilters(secured.where, model);
          rejectProtectedFilters(secured.orderBy, model);
          if (secured.distinct) rejectProtectedFilters(Object.fromEntries([secured.distinct].flat().map((field) => [String(field), true])), model);
          for (const field of ["data", "create", "update"]) {
            if (secured[field]) secured[field] = encryptData(secured[field], model);
          }
          const result = await query(secured as typeof args);
          return decryptResult(result, model);
        },
      },
    },
  });
}
