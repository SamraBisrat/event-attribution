import { useState } from "react";
import { Form } from "react-router";

type TimelineRow = { name: string; dailyOrders: { day: number; orders: number; started: boolean; complete: boolean }[] };
export function PurchaseTimeline({ rows, windowDays }: { rows: TimelineRow[]; windowDays: number }) {
  const [activeDay, setActiveDay] = useState(0);
  const series = Array.from({ length: windowDays }, (_, day) => ({
    day,
    orders: rows.reduce((sum, row) => sum + (row.dailyOrders[day]?.orders ?? 0), 0),
    started: rows.filter((row) => row.dailyOrders[day]?.started).length,
    complete: rows.filter((row) => row.dailyOrders[day]?.complete).length,
  }));
  const visible = series.filter((point) => point.started > 0);
  const selected = series[Math.min(activeDay, windowDays - 1)];
  const maximum = Math.max(1, ...series.map((point) => point.orders));
  const horizontal = (day: number) => 50 + day / Math.max(1, windowDays - 1) * 620;
  const vertical = (orders: number) => 210 - orders / maximum * 160;
  const line = visible.map((point) => `${horizontal(point.day)},${vertical(point.orders)}`).join(" ");
  return <section className="card purchase-timeline" aria-labelledby="timeline-title">
    <div className="dashboard-table-heading"><div><h2 id="timeline-title">Purchases over time</h2><p>{rows.length === 1 ? rows[0].name : "All selected events"} · Daily orders after each event</p></div>
      <Form method="get" className="timeline-windows">{[7, 30, 60, 90].map((days) => <button key={days} name="windowDays" value={days} aria-pressed={windowDays === days}>{days} days</button>)}</Form>
    </div>
    <p>Day 0 is the first 24 hours after an event starts. This view uses the same purchase window as the rest of the dashboard.</p>
    {!visible.length ? <div className="chart-empty">{rows.length ? "These events have not started yet." : "Create an event to see when purchases happen."}</div> : <>
      <svg className="timeline-svg" viewBox="0 0 710 255" role="img" aria-label={`Daily attributed orders over ${windowDays} days. ${series.reduce((sum, point) => sum + point.orders, 0)} recorded purchases. Use the day slider below for exact values.`}>
        {[0, maximum].map((amount) => <g key={amount}><line x1="50" x2="670" y1={vertical(amount)} y2={vertical(amount)} stroke="#dde5ef" /><text x="40" y={vertical(amount) + 5} textAnchor="end">{amount}</text></g>)}
        <polyline points={line} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" />
        {visible.map((point) => <g key={point.day} onMouseEnter={() => setActiveDay(point.day)} onClick={() => setActiveDay(point.day)}>
          <circle cx={horizontal(point.day)} cy={vertical(point.orders)} r={selected.day === point.day ? 6 : 3} fill="#2563eb" />
          <circle cx={horizontal(point.day)} cy={vertical(point.orders)} r="9" fill="transparent"><title>Day {point.day}: {point.orders} orders; {point.complete} of {rows.length} events have completed this day</title></circle>
        </g>)}
        {[0, Math.floor((windowDays - 1) / 2), windowDays - 1].map((day) => <text key={day} x={horizontal(day)} y="238" textAnchor="middle">Day {day}</text>)}
      </svg>
      <label htmlFor="timeline-day">Explore day {selected.day}<input id="timeline-day" type="range" min="0" max={windowDays - 1} value={selected.day} onChange={(event) => setActiveDay(Number(event.target.value))} aria-valuetext={`Day ${selected.day}: ${selected.started ? `${selected.orders} recorded orders` : "not yet reached"}`} /></label>
      <p role="status"><strong>Day {selected.day}: {selected.started ? `${selected.orders} recorded orders` : "Not yet reached"}</strong> · {selected.complete} of {rows.length} events have completed this day.</p>
      {series.every((point) => point.orders === 0) && <p>No attributed purchases recorded yet. Update Shopify orders to check for sales.</p>}
    </>}
    <p>Recent events have unfinished days. Future days are left blank. History is limited to the orders saved in the app; missing history does not mean zero purchases. Each purchase is counted once using the existing attribution rules.</p>
  </section>;
}
