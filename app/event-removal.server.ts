import type { PrismaClient } from "@prisma/client";

export async function removeEventRecord(db: PrismaClient, shop: string, eventId: string) {
  if (!eventId.trim()) return false;
  const result = await db.event.deleteMany({ where: { id: eventId, shop } });
  return result.count > 0;
}

export async function removeAttendeeRecord(db: PrismaClient, shop: string, eventId: string, attendeeId: string) {
  if (!eventId.trim() || !attendeeId.trim()) return false;
  return db.$transaction(async (transaction) => {
    const attendee = await transaction.eventAttendee.findFirst({
      where: { id: attendeeId, eventId, event: { shop }, customer: { shop } },
      select: { id: true, customerId: true },
    });
    if (!attendee) return false;
    await transaction.attribution.deleteMany({ where: { eventId, customerId: attendee.customerId } });
    await transaction.eventAttendee.delete({ where: { id: attendee.id } });
    return true;
  });
}
