import { Form, useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { attendeeOrders } from "../customer-identity.server";
import { dashboard } from "../dashboard.server";
import { dashboardCsv } from "../dashboard-csv";
import { useState } from "react";
import { EventCharts } from "../components/event-charts";
import { PurchaseTimeline } from "../components/purchase-timeline";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const requested = Number(new URL(request.url).searchParams.get("windowDays") ?? 30);
  const windowDays = [7, 30, 60, 90].includes(requested) ? requested : 30;
  const events = await db.event.findMany({ where: { shop: session.shop }, include: { attendees: { where: { customer: { shop: session.shop } } } } });
  const orders = await attendeeOrders(db, session.shop);
  const customers = await db.customer.findMany({ where: { shop: session.shop }, select: { id: true, email: true } });
  return { report: dashboard(events, orders, windowDays), windowDays, customers };
}
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const form = await request.formData();
  const eventId = String(form.get("eventId") ?? "");
  const eventCodes = [...new Set(String(form.get("codes") ?? "").split(",").map((code) => code.trim().toUpperCase()).filter(Boolean))];
  if (eventCodes.length > 20 || eventCodes.some((code) => code.length > 100)) return { error: "Use up to 20 codes, each under 100 characters." };
  const saved = await db.event.updateMany({ where: { id: eventId, shop: session.shop }, data: { discountCodes: JSON.stringify(eventCodes) } });
  return saved.count ? { message: "Event codes saved. Sync orders to refresh purchases." } : { error: "Event not found." };
}
const money = (value: Record<string, number>) => Object.entries(value).map(([currency, amount]) => `${amount.toFixed(2)} ${currency}`).join(" · ") || "—";

export default function Dashboard() {
  const { report, windowDays, customers } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [selectedEvent, setSelectedEvent] = useState("");
  const selectedId = report.rows.some((row) => row.id === selectedEvent) ? selectedEvent : "";
  const visibleRows = selectedId ? report.rows.filter((row) => row.id === selectedId) : report.rows;
  const totalOrders = report.rows.reduce((sum, row) => sum + row.orders, 0);
  const codeOrders = report.rows.reduce((sum, row) => sum + row.codeOrders, 0);
  const revenue: Record<string, number> = {};
  for (const row of report.rows) for (const [currency, amount] of Object.entries(row.revenue)) revenue[currency] = (revenue[currency] ?? 0) + amount;
  function downloadCsv() {
    const url = URL.createObjectURL(new Blob([dashboardCsv(visibleRows, windowDays)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `event-results-${windowDays}-days${selectedId ? "-filtered" : ""}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <s-page heading="Dashboard">
    <div className="dashboard-intro"><p>Your events at a glance. See who came, who purchased, and which events performed best.</p><s-link href="/app/attendance">Update Shopify orders →</s-link></div>
    <s-section heading="Across all events">
      <Form method="get"><label htmlFor="window">Purchase window </label><select key={windowDays} name="windowDays" id="window" defaultValue={windowDays}>{[7, 30, 60, 90].map((days) => <option key={days} value={days}>{days} days</option>)}</select> <button>Update</button></Form>
      <div className="metric-grid">
        <article className="metric-card"><span>Events tracked</span><strong>{report.rows.length}</strong><small>Across your event calendar</small></article>
        <article className="metric-card"><span>Unique attendees</span><strong>{report.uniqueAttendees}</strong><small>Each person counted once</small></article>
        <article className="metric-card"><span>Unique buyers</span><strong>{report.uniqueBuyers}</strong><small>Includes returning customers</small></article>
        <article className="metric-card"><span>Attributed orders</span><strong>{totalOrders}</strong><small>Each purchase credited once</small></article>
        <article className="metric-card metric-highlight"><span>Attributed revenue</span><strong>{money(revenue)}</strong><small>Currencies shown separately</small></article>
        <article className="metric-card"><span>Orders using event codes</span><strong>{codeOrders}</strong><small>{totalOrders ? Math.round(codeOrders / totalOrders * 100) : 0}% of attributed orders</small></article>
      </div>
      <div className="dashboard-highlights"><article>
        <h3>{report.revenueLeaders.length > 1 ? "Leading events by currency" : report.revenueLeaders[0]?.events.length > 1 ? "Joint leading events" : "Leading event"}</h3>
        {!report.revenueLeaders.length ? <><strong>Waiting for purchases</strong><p>Update orders to start seeing event performance.</p></> : report.revenueLeaders.map((leader) => <div key={leader.currency}>
          {leader.events.length === 1 ? <strong>{leader.events[0].name}</strong> : <><strong>{leader.events.length} events tied</strong><ul>{leader.events.map((event) => <li key={event.id}>{event.name}</li>)}</ul></>}
          <p>{money({ [leader.currency]: leader.revenue })} attributed revenue{leader.events.length > 1 ? " each" : ""} · {windowDays}-day purchase window</p>
        </div>)}
        <small>Ranked by attributed revenue across all events. Different currencies are compared separately.</small>
      </article><article><h3>New customer acquisition</h3><strong>Not yet verified</strong><p>Full purchase history is needed to distinguish first-time buyers from returning customers.</p></article></div>
      <p>Orders refresh automatically while the app is open. See Attendance &amp; Orders for the last successful update and history coverage. Older events and before/after comparisons may be incomplete.</p>
      <p>{report.ambiguousOrders} orders excluded because their codes match multiple events. Code matches take priority; otherwise the most recent attended event receives credit. Each order is counted once.</p>
    </s-section>
    <EventCharts rows={report.rows} selectedId={selectedId} onSelect={setSelectedEvent} />
    <PurchaseTimeline rows={visibleRows} windowDays={windowDays} />
    <s-section heading="Event discount codes">
      <details><summary>Manage event codes</summary>
      <p>Enter existing Shopify codes separated by commas. This links codes for tracking; it does not create discounts. Give each event unique codes.</p>
      {report.rows.map((event) => <fetcher.Form method="post" key={event.id}><input type="hidden" name="eventId" value={event.id} /><p><label>{event.name}: <input name="codes" defaultValue={event.codes.join(", ")} /></label> <button disabled={fetcher.state !== "idle"}>Save codes</button></p></fetcher.Form>)}
      <p role="status">{fetcher.data && ("error" in fetcher.data ? fetcher.data.error : fetcher.data.message)}</p>
      </details>
    </s-section>
    <s-section heading="Customer value before and after first attendance">
      <details><summary>Explore customer spending</summary>
      <p>90 days before vs. 90 days after the first attended event. These are observed spending totals, not predicted LTV. All before periods have incomplete history under the current 59-day sync.</p>
      {report.journeys.map((journey) => <details key={journey.customerId}><summary>{customers.find((customer) => customer.id === journey.customerId)?.email ?? journey.customerId} · {journey.firstEvent}</summary>
        <p>After period: {journey.afterPeriodComplete ? "90 days elapsed; coverage still limited" : "Still in progress"}</p>
        {Object.entries(journey.spending).map(([currency, spending]) => <p key={currency}>{currency}: before {spending.before.toFixed(2)} · after {spending.after.toFixed(2)} · observed lifetime {spending.observedLifetime.toFixed(2)}</p>)}
      </details>)}
      </details>
    </s-section>
    <s-section heading="Event performance">
      <div className="dashboard-table-heading"><p>{selectedId ? `Showing ${visibleRows[0].name}.` : "Showing all events."} Ranked by purchases within {windowDays} days of each event.</p><button onClick={downloadCsv} disabled={!visibleRows.length}>Export CSV ↓</button></div>
      {!report.rows.length ? <p>No events yet. <s-link href="/app/events">Create your first event</s-link> to get started.</p> : <div className="table-scroll"><table><caption className="visually-hidden">Event performance for a {windowDays}-day purchase window</caption><thead><tr>{["Event", "Attendees", "Buyers", "Orders", "Conversion", "Revenue", "Code orders", "Orders outside attendee list"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{visibleRows.map((event) => <tr key={event.id}><td><strong>{event.name}</strong><br />{new Date(event.startAt).toISOString().slice(0, 10)}</td><td>{event.attendees}</td><td>{event.buyers}</td><td>{event.orders}</td><td>{event.conversion}%</td><td>{money(event.revenue)}</td><td>{event.codeOrders}</td><td>{event.outsideAttendeeOrders}</td></tr>)}</tbody></table></div>}
      <p>Conversion measures confirmed attendees who purchased. Code buyers outside the attendee list do not inflate conversion. The CSV includes the selected purchase window and history limitations.</p>
    </s-section>
  </s-page>;
}
