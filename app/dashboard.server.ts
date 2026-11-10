type EventRecord = { id: string; name: string; startAt: Date; discountCodes: string; attendees: { customerId: string; attended: boolean }[] };
type OrderRecord = { id: string; customerId: string | null; orderDate: Date; total: number; currency: string; discountCodes: string };
export function codes(value: string): string[] {
  try { return (JSON.parse(value) as string[]).map((code) => code.trim().toUpperCase()); } catch { return []; }
}
export function dashboard(events: EventRecord[], orders: OrderRecord[], windowDays: number, now = new Date()) {
  const day = 86400000;
  const rows = events.map((event) => ({ id: event.id, name: event.name, startAt: event.startAt,
    attendees: new Set(event.attendees.filter((attendee) => attendee.attended).map((attendee) => attendee.customerId)),
    orders: 0, buyers: new Set<string>(), codeOrders: 0, outsideAttendeeOrders: 0,
    revenue: {} as Record<string, number>, codes: codes(event.discountCodes),
    dailyOrders: Array.from({ length: windowDays }, (_, index) => ({
      day: index,
      orders: 0,
      started: now.getTime() >= event.startAt.getTime() + index * day,
      complete: now.getTime() >= event.startAt.getTime() + (index + 1) * day,
    })),
  }));
  const acquired = new Set<string>();
  let ambiguousOrders = 0;
  for (const order of orders) {
    if (order.total <= 0 || order.orderDate > now) continue;
    const eligible = rows.filter((event) => order.orderDate >= event.startAt &&
      order.orderDate.getTime() < event.startAt.getTime() + windowDays * day);
    const matches = eligible.filter((event) => codes(order.discountCodes).some((code) => event.codes.includes(code)));
    if (matches.length > 1) { ambiguousOrders++; continue; }
    const event = matches[0] ?? eligible.filter((event) => order.customerId && event.attendees.has(order.customerId))
      .sort((first, second) => second.startAt.getTime() - first.startAt.getTime() || first.id.localeCompare(second.id))[0];
    if (!event) continue;
    event.orders++;
    event.dailyOrders[Math.floor((order.orderDate.getTime() - event.startAt.getTime()) / day)].orders++;
    if (matches.length) event.codeOrders++;
    if (!order.customerId || !event.attendees.has(order.customerId)) event.outsideAttendeeOrders++;
    event.revenue[order.currency] = (event.revenue[order.currency] ?? 0) + order.total;
    if (order.customerId) { event.buyers.add(order.customerId); acquired.add(order.customerId); }
  }
  const journeys = [...new Set(rows.flatMap((event) => [...event.attendees]))].map((customerId) => {
    const first = rows.filter((event) => event.attendees.has(customerId)).sort((first, second) => first.startAt.getTime() - second.startAt.getTime())[0];
    const spending: Record<string, { before: number; after: number; observedLifetime: number }> = {};
    for (const order of orders.filter((order) => order.customerId === customerId && order.total > 0 && order.orderDate <= now)) {
      const value = spending[order.currency] ??= { before: 0, after: 0, observedLifetime: 0 };
      value.observedLifetime += order.total;
      const difference = order.orderDate.getTime() - first.startAt.getTime();
      if (difference >= -90 * day && difference < 0) value.before += order.total;
      if (difference >= 0 && difference < 90 * day) value.after += order.total;
    }
    return { customerId, firstEvent: first.name, spending, afterPeriodComplete: now.getTime() >= first.startAt.getTime() + 90 * day };
  });
  const revenueLeaders = [...new Set(rows.flatMap((row) => Object.keys(row.revenue)))].sort().flatMap((currency) => {
    const amount = (row: typeof rows[number]) => Number((row.revenue[currency] ?? 0).toFixed(2));
    const revenue = Math.max(0, ...rows.map(amount));
    if (!revenue) return [];
    const events = rows.filter((row) => amount(row) === revenue)
      .map(({ id, name }) => ({ id, name }))
      .sort((first, second) => first.name.localeCompare(second.name) || first.id.localeCompare(second.id));
    return [{ currency, revenue, events }];
  });
  return { uniqueBuyers: acquired.size, uniqueAttendees: journeys.length, ambiguousOrders, revenueLeaders,
    rows: rows.map((row) => ({ ...row, attendees: row.attendees.size, buyers: row.buyers.size,
      conversion: row.attendees.size ? Math.round([...row.buyers].filter((buyer) => row.attendees.has(buyer)).length / row.attendees.size * 10000) / 100 : 0,
    })).sort((first, second) => second.orders - first.orders || first.name.localeCompare(second.name) || first.id.localeCompare(second.id)), journeys };
}
