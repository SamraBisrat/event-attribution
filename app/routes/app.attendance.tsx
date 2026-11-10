import { Form, useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { attendeeOrders } from "../customer-identity.server";
import { syncOrders } from "../sync-orders.server";
import { attendeeSales } from "../attendee-sales";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const events = await db.event.findMany({ where: { shop: session.shop }, include: { attendees: { where: { customer: { shop: session.shop } }, include: { customer: true } } }, orderBy: { startAt: "desc" } });
  const requested = new URL(request.url).searchParams.get("eventId") ?? "";
  const selectedId = events.some((event) => event.id === requested) ? requested : "";
  const orders = await attendeeOrders(db, session.shop);
  const sync = await db.orderSyncState.findUnique({ where: { shop: session.shop } });
  return {
    events: events.map((event) => ({ id: event.id, name: event.name, startAt: event.startAt, location: event.location, past: (event.endAt ?? event.startAt) <= new Date(), confirmed: event.attendees.filter((attendee) => attendee.attended).length })),
    selectedId, rows: attendeeSales(events, orders, selectedId), sync,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const form = await request.formData();
  if (form.get("intent") === "attendance") {
    const attended = form.get("attended");
    if (typeof form.get("attendeeId") !== "string" || !["true", "false"].includes(String(attended))) return Response.json({ error: "Invalid attendance update" }, { status: 400 });
    const result = await db.eventAttendee.updateMany({ where: { id: String(form.get("attendeeId")), event: { shop: session.shop }, customer: { shop: session.shop } }, data: { attended: attended === "true" } });
    return result.count ? { message: "Attendance saved." } : Response.json({ error: "Attendee not found" }, { status: 404 });
  }
  if (form.get("intent") !== "sync") return Response.json({ error: "Unknown action" }, { status: 400 });
  try { return await syncOrders(db, admin, session.shop, session.scope ?? ""); }
  catch { return Response.json({ error: "Orders could not be refreshed. Check Shopify order permissions and retry. Previously saved sales are unchanged." }, { status: 502 }); }
}

export default function Attendance() {
  const { events, rows, selectedId, sync } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  return <s-page heading="Attendance & Orders">
    <p>Choose an event to explore its attendees and purchases.</p>
    <Form method="get" className="event-tile-grid">
      <button type="submit" name="eventId" value="" className="event-tile" aria-pressed={!selectedId}><span>All past events</span><strong>{events.filter((event) => event.past).length}</strong><small>Browse confirmed attendees</small></button>
      {events.map((event) => <button type="submit" name="eventId" value={event.id} key={event.id} className="event-tile" aria-pressed={selectedId === event.id}><span>{event.name}</span><strong>{event.confirmed}</strong><small>Confirmed attendees</small><small>{new Date(event.startAt).toISOString().slice(0, 10)}</small><small className="event-tile-location">{event.location || "Location not set"}</small></button>)}
    </Form>
    <s-section heading={selectedId ? events.find((event) => event.id === selectedId)?.name ?? "Event attendees" : "Attendees across past events"}>
      <div className="dashboard-table-heading"><p>{rows.length} confirmed attendees · {sync ? `Last update: ${new Date(sync.lastSuccessAt).toISOString().replace("T", " ").slice(0, 19)} UTC` : "Waiting for the first order update"}</p><fetcher.Form method="post"><input type="hidden" name="intent" value="sync" /><button disabled={fetcher.state !== "idle"}>{fetcher.state !== "idle" ? "Updating…" : "Refresh now"}</button></fetcher.Form></div>
      <p>Purchases shown since {selectedId ? "this event began" : "each person’s first past event"}, with no end-date cutoff. Each order is counted once per person in this view; totals across separate event views may overlap.</p>
      <p>{sync?.fullHistory ? "Full-history access is enabled." : "Recent order history only. Older purchases may be missing; full history requires Shopify’s read_all_orders permission."}</p>
      {fetcher.data && <p role="status">{String("error" in fetcher.data ? fetcher.data.error : fetcher.data.message)}</p>}
      {!rows.length ? <p>No confirmed attendees in this view. <s-link href="/app/import">Add attendees</s-link> or select another event.</p> : <div className="table-scroll"><table><thead><tr><th scope="col">Attendee</th><th scope="col">Event attended</th><th scope="col">Orders made</th><th scope="col">Revenue</th></tr></thead><tbody>{rows.map((row) => <tr key={row.customerId}><td>{row.name && <strong>{row.name}<br /></strong>}{row.email ?? `Attendee ${row.reference.split("/").pop()}`}{row.phone && <><br /><small>{row.phone}</small></>}</td><td>{row.events.join(", ")}</td><td>{row.purchases.length ? <details><summary>{row.purchases.length} orders</summary><ul>{row.purchases.map((order) => <li key={order.id}>Order {order.id.split("/").pop()} · {new Date(order.date).toISOString().slice(0, 10)} · {order.total.toFixed(2)} {order.currency}</li>)}</ul></details> : "0"}</td><td>{Object.entries(row.revenue).map(([currency, total]) => `${total.toFixed(2)} ${currency}`).join(" · ") || "—"}</td></tr>)}</tbody></table></div>}
    </s-section>
  </s-page>;
}
