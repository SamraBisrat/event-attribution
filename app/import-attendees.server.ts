import type { PrismaClient } from "@prisma/client";
import { normalizedEmail } from "./customer-identity.server.ts";

export type CsvAttendee = Record<string, string>;

export async function importAttendees(db: PrismaClient, shop: string, eventId: string, rows: CsvAttendee[]) {
  return db.$transaction(async (transaction) => {
    if (!await transaction.event.findFirst({ where: { id: eventId, shop } })) throw new Error("Event not found");
    const results = { imported: 0, alreadyRegistered: 0, invalid: [] as { row: number; reason: string }[], eventMismatch: [] as { row: number; eventId: string }[] };
    const customers = await transaction.customer.findMany({ where: { shop } });
    for (const [index, row] of rows.entries()) {
      const line = index + 2;
      const rowEvent = (row["Event ID"] ?? "").trim();
      const email = normalizedEmail(row.Email);
      const firstName = (row["First name"] ?? "").trim();
      const lastName = (row["Last name"] ?? "").trim();
      const phone = (row["Phone number"] ?? row.Phone ?? "").trim();
      if (!rowEvent || !email) { results.invalid.push({ row: line, reason: "Event ID and a valid email address are required" }); continue; }
      if (rowEvent !== eventId) { results.eventMismatch.push({ row: line, eventId: rowEvent }); continue; }
      if (firstName.length > 200 || lastName.length > 200 || phone.length > 80) { results.invalid.push({ row: line, reason: "Names must be 200 characters or fewer; phone numbers 80 or fewer" }); continue; }
      const matches = customers.filter((customer) => normalizedEmail(customer.email) === email);
      const local = matches.filter((customer) => !customer.shopifyCustomerId);
      let customer = local.length === 1 ? local[0] : matches.length === 1 ? matches[0] : undefined;
      const profile = { ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}), ...(phone ? { phone } : {}) };
      if (customer) {
        Object.assign(customer, await transaction.customer.update({ where: { id: customer.id }, data: profile }));
      } else {
        customer = await transaction.customer.create({ data: { shop, email, ...profile } });
        customers.push(customer);
      }
      const where = { eventId_customerId: { eventId, customerId: customer.id } };
      const existing = await transaction.eventAttendee.findUnique({ where });
      await transaction.eventAttendee.upsert({ where, create: { eventId, customerId: customer.id, attended: true }, update: { attended: true } });
      if (existing) results.alreadyRegistered++; else results.imported++;
    }
    return results;
  }, { timeout: 60000 });
}
