import type { PrismaClient } from "@prisma/client";

export function normalizedEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

export async function attendeeOrders(db: PrismaClient, shop: string) {
  const [orders, customers] = await Promise.all([
    db.order.findMany({ where: { shop } }),
    db.customer.findMany({ where: { shop }, include: { _count: { select: { attendees: true } } } }),
  ]);
  const byId = new Map(customers.map((customer) => [customer.id, customer]));
  const byEmail = new Map<string, typeof customers>();
  for (const customer of customers) {
    const email = normalizedEmail(customer.email);
    if (email) byEmail.set(email, [...(byEmail.get(email) ?? []), customer]);
  }
  return orders.map((order) => {
    const owner = order.customerId ? byId.get(order.customerId) : undefined;
    if (owner?._count.attendees) return order;
    const email = normalizedEmail(order.email) ?? normalizedEmail(owner?.email);
    const candidates = email ? byEmail.get(email) ?? [] : [];
    const attendees = candidates.filter((candidate) => candidate._count.attendees > 0);
    const remoteIds = new Set(candidates.flatMap((candidate) => candidate.shopifyCustomerId ? [candidate.shopifyCustomerId] : []));
    if (owner?.shopifyCustomerId) remoteIds.add(owner.shopifyCustomerId);
    return attendees.length === 1 && remoteIds.size <= 1 ? { ...order, customerId: attendees[0].id } : order;
  });
}
