type AttendanceEvent = { id: string; name: string; startAt: Date; endAt: Date | null; attendees: { attended: boolean; customerId: string; customer: { email: string | null; shopifyCustomerId: string } }[] };
type Sale = { id: string; shopifyOrderId: string; customerId: string | null; orderDate: Date; total: number; currency: string };
export function attendeeSales(events: AttendanceEvent[], orders: Sale[], selectedId = "", now = new Date()) {
  const selected = selectedId ? events.filter((event) => event.id === selectedId) : events.filter((event) => (event.endAt ?? event.startAt) <= now);
  const attendees = new Map<string, { customerId: string; email: string | null; reference: string; events: string[]; since: Date }>();
  for (const event of selected) for (const attendee of event.attendees) {
    if (!attendee.attended) continue;
    const existing = attendees.get(attendee.customerId);
    if (existing) { existing.events.push(event.name); if (event.startAt < existing.since) existing.since = event.startAt; }
    else attendees.set(attendee.customerId, { customerId: attendee.customerId, email: attendee.customer.email, reference: attendee.customer.shopifyCustomerId, events: [event.name], since: event.startAt });
  }
  return [...attendees.values()].map((attendee) => {
    const seen = new Set<string>();
    const purchases = orders.filter((order) => {
      if (order.customerId !== attendee.customerId || order.total <= 0 || order.orderDate < attendee.since || order.orderDate > now || seen.has(order.id)) return false;
      seen.add(order.id); return true;
    });
    const revenue: Record<string, number> = {};
    for (const order of purchases) revenue[order.currency] = (revenue[order.currency] ?? 0) + order.total;
    return { ...attendee, purchases: purchases.map((order) => ({ id: order.shopifyOrderId, date: order.orderDate, total: order.total, currency: order.currency })), revenue };
  }).sort((first, second) => (first.email ?? first.reference).localeCompare(second.email ?? second.reference));
}
