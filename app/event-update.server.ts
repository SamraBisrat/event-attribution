import type { PrismaClient } from "@prisma/client";
import type { eventInput } from "./event-input.server";

export async function updateEventRecord(db: PrismaClient, shop: string, eventId: string, data: ReturnType<typeof eventInput>) {
  const result = await db.event.updateMany({ where: { id: eventId, shop }, data });
  return result.count === 1;
}
