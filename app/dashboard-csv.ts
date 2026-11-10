type ExportRow = { name: string; startAt: Date | string; attendees: number; buyers: number; orders: number; conversion: number; revenue: Record<string, number>; codeOrders: number; outsideAttendeeOrders: number };
export function dashboardCsv(rows: ExportRow[], windowDays: number) {
  const cell = (value: string | number) => {
    const text = String(value);
    const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const header = ["Event", "Event date (UTC)", "Window (days)", "Attendees", "Buyers", "Orders", "Conversion (%)", "Revenue by currency", "Code orders", "Orders outside attendee list", "History coverage"];
  return "\uFEFF" + [header, ...rows.map((row) => [row.name, new Date(row.startAt).toISOString().slice(0, 10), windowDays, row.attendees, row.buyers, row.orders, row.conversion,
    Object.entries(row.revenue).map(([currency, amount]) => `${amount.toFixed(2)} ${currency}`).join("; "), row.codeOrders, row.outsideAttendeeOrders, "Partial: manual sync of recent 59 days"])]
    .map((row) => row.map(cell).join(",")).join("\r\n");
}
