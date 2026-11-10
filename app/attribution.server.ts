type Attendee = { customerId: string; attended: boolean };
type StoredOrder = {
  id: string;
  customerId: string | null;
  orderDate: Date;
  total: number;
  currency: string;
};

export function summarizeAttribution(
  startAt: Date,
  attendees: Attendee[],
  orders: StoredOrder[],
  windowDays: number,
) {
  const customerIds = new Set(
    attendees.filter((attendee) => attendee.attended).map((attendee) => attendee.customerId),
  );
  const endAt = startAt.getTime() + windowDays * 86400000;
  const purchasers = new Set<string>();
  const seenOrders = new Set<string>();
  const revenue = new Map<string, number>();
  let attributedOrders = 0;
  for (const order of orders) {
    if (
      !order.customerId || !customerIds.has(order.customerId) || order.total <= 0 ||
      order.orderDate.getTime() < startAt.getTime() ||
      order.orderDate.getTime() >= endAt || seenOrders.has(order.id)
    ) continue;
    seenOrders.add(order.id);
    purchasers.add(order.customerId);
    attributedOrders++;
    revenue.set(order.currency, (revenue.get(order.currency) ?? 0) + order.total);
  }
  return {
    totalRegistered: attendees.length,
    totalAttendees: customerIds.size,
    customersWhoPurchased: purchasers.size,
    attributedOrders,
    conversionRate: customerIds.size ? Math.round(purchasers.size / customerIds.size * 10000) / 100 : 0,
    revenueByCurrency: [...revenue].sort(([first], [second]) => first.localeCompare(second))
      .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })),
  };
}
