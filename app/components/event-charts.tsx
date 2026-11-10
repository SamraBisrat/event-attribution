import { useState } from "react";

type ChartRow = { id: string; name: string; orders: number; codeOrders: number; conversion: number; revenue: Record<string, number> };
export function EventCharts({ rows, selectedId, onSelect }: { rows: ChartRow[]; selectedId: string; onSelect: (id: string) => void }) {
  const [metric, setMetric] = useState("orders");
  const [currencyChoice, setCurrency] = useState("");
  const currencies = [...new Set(rows.flatMap((row) => Object.keys(row.revenue)))].sort();
  const currency = currencies.includes(currencyChoice) ? currencyChoice : currencies[0] ?? "";
  const value = (row: ChartRow) => metric === "revenue" ? row.revenue[currency] ?? 0 : metric === "conversion" ? row.conversion : row.orders;
  const ranked = [...rows].sort((first, second) => value(second) - value(first) || first.name.localeCompare(second.name));
  const maximum = Math.max(1, ...ranked.map(value));
  const selectedRows = selectedId ? rows.filter((row) => row.id === selectedId) : rows;
  const orders = selectedRows.reduce((sum, row) => sum + row.orders, 0);
  const codes = selectedRows.reduce((sum, row) => sum + row.codeOrders, 0);
  const share = orders ? codes / orders * 100 : 0;
  const selectedName = rows.find((row) => row.id === selectedId)?.name;
  const format = (amount: number) => metric === "revenue" ? `${amount.toFixed(2)} ${currency}` : metric === "conversion" ? `${amount}%` : `${amount} orders`;
  return <section className="interactive-charts" aria-label="Interactive event insights">
    <article className="card chart-card">
      <h2>Compare your events</h2><p>Choose a measure. Select a bar to focus the breakdown and table below.</p>
      <div className="chart-controls"><label>Compare by<select value={metric} onChange={(event) => setMetric(event.target.value)}><option value="orders">Orders</option><option value="revenue">Revenue</option><option value="conversion">Conversion rate</option></select></label>
      {metric === "revenue" && <label>Currency<select value={currency} disabled={!currencies.length} onChange={(event) => setCurrency(event.target.value)}>{currencies.length ? currencies.map((item) => <option key={item}>{item}</option>) : <option value="">No revenue yet</option>}</select></label>}</div>
      {!ranked.length ? <p>Create an event to start comparing results.</p> : <div className="event-bars">{ranked.map((row) => <button key={row.id} className="event-bar" aria-pressed={selectedId === row.id} onClick={() => onSelect(selectedId === row.id ? "" : row.id)} title={`${row.name}: ${format(value(row))}`}>
        <span className="bar-label"><span>{row.name}</span><strong>{format(value(row))}</strong></span>
        <span className="bar-track" aria-hidden="true"><span style={{ width: `${value(row) / maximum * 100}%` }} /></span>
      </button>)}</div>}
      {ranked.length > 0 && maximum === 1 && ranked.every((row) => value(row) === 0) && <p>No purchases for this measure yet. Update Shopify orders to check for sales.</p>}
    </article>
    <article className="card chart-card">
      <h2>How purchases were linked</h2><p>{selectedName ?? "All events"} · {orders} attributed orders</p>
      {orders ? <div className="attribution-ring" role="img" aria-label={`${codes} orders linked by event code, ${orders - codes} linked by attendance alone`} style={{ background: `conic-gradient(#2563eb 0% ${share}%, #b8d6fd ${share}% 100%)` }}><div><strong>{Math.round(share)}%</strong><span>using event codes</span></div></div> : <div className="chart-empty">No attributed purchases yet</div>}
      <ul className="chart-legend"><li><span><i className="code-dot" />Event code</span><strong>{codes}</strong></li><li><span><i className="attendance-dot" />Attendance alone</span><strong>{orders - codes}</strong></li></ul>
      <p>Code matches take priority. Each order appears in one category only.</p>
      <button type="button" onClick={() => { onSelect(""); setMetric("orders"); setCurrency(""); }}>Reset filters</button>
      <p role="status">{selectedName ? `Showing ${selectedName} in the table and CSV export.` : "Showing all events in the table and CSV export."} Snapshot cards above always show all events.</p>
    </article>
  </section>;
}
