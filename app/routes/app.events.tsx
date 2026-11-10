import { useFetcher, useLoaderData } from "react-router";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { eventInput } from "../event-input.server";
import { updateEventRecord } from "../event-update.server";
import { EventEditor } from "../components/EventEditor";
import { removeEventRecord, removeAttendeeRecord } from "../event-removal.server";
function codes(value: string): string[] {
  try { return (JSON.parse(value) as string[]).map((code) => code.trim().toUpperCase()); } catch { return []; }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const events = await db.event.findMany({
    where: { shop: session.shop }, orderBy: { startAt: "desc" },
    include: { attendees: { where: { customer: { shop: session.shop } }, include: { customer: true }, orderBy: { registeredAt: "asc" } } },
  });
  const orders = await db.order.findMany({ where: { shop: session.shop }, select: { id: true, shopifyOrderId: true, customerId: true, discountCodes: true, orderDate: true, total: true, currency: true } });
  return { events: events.map((event) => ({ ...event, codeOrders: orders.filter((order) => order.orderDate >= event.startAt && codes(order.discountCodes).some((code) => codes(event.discountCodes).includes(code))) })) };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const form = await request.formData();
  const intent = form.get("intent") ?? "create";
  if (intent === "deleteEvent" || intent === "removeAttendee") {
    if (form.get("confirmed") !== "yes") return Response.json({ error: "Please confirm this removal." }, { status: 400 });
    const eventId = String(form.get("eventId") ?? "");
    const removed = intent === "deleteEvent"
      ? await removeEventRecord(db, session.shop, eventId)
      : await removeAttendeeRecord(db, session.shop, eventId, String(form.get("attendeeId") ?? ""));
    if (!removed) return Response.json({ error: "This event or attendee could not be found. Refresh the page and try again." }, { status: 404 });
    return { message: intent === "deleteEvent" ? "Event deleted. Customers and orders are unchanged." : "Attendee removed from this event. Customers and orders are unchanged." };
  }
  if (intent !== "create" && intent !== "update") return Response.json({ error: "Unknown action." }, { status: 400 });
  let data;
  try { data = eventInput(form); } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid event details." }, { status: 400 });
  }
  if (intent === "update") {
    const updated = await updateEventRecord(db, session.shop, String(form.get("eventId") ?? ""), data);
    if (!updated) return Response.json({ error: "This event could not be found. Refresh the page and try again." }, { status: 404 });
    return { message: `Saved ${data.name}. Your event details are updated across the app.` };
  }
  const event = await db.event.create({ data: { ...data, shop: session.shop } });
  return { message: `Created ${event.name}. You can now import its attendees.`, eventId: event.id };
}

export default function Events() {
  const { events } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [removal, setRemoval] = useState<{ intent: string; eventId: string; attendeeId?: string; message: string } | null>(null);
  return <s-page heading="Events">
    {removal && <dialog className="removal-dialog" ref={(element) => { if (element && !element.open) element.showModal(); }} onCancel={() => setRemoval(null)} aria-labelledby="removal-title"><div className="card">
      <h2 id="removal-title">Confirm removal</h2><p>{removal.message}</p>
      <fetcher.Form method="post" onSubmit={() => setRemoval(null)}>
        <input type="hidden" name="intent" value={removal.intent} /><input type="hidden" name="eventId" value={removal.eventId} /><input type="hidden" name="attendeeId" value={removal.attendeeId ?? ""} /><input type="hidden" name="confirmed" value="yes" />
        <button type="button" onClick={() => setRemoval(null)}>Cancel</button>{" "}<button className="danger-button" type="submit">Confirm removal</button>
      </fetcher.Form>
    </div></dialog>}
    <s-section heading="Create an event">
      <fetcher.Form method="post" onSubmit={(event) => {
        const form = event.currentTarget;
        for (const field of ["startAt", "endAt"]) {
          const input = form.querySelector(`#${field}`) as HTMLInputElement;
          const hidden = form.querySelector(`#${field}Value`) as HTMLInputElement;
          hidden.value = input.value ? new Date(input.value).toISOString() : "";
        }
      }}>
        <fieldset disabled={fetcher.state !== "idle"} style={{ border: 0, padding: 0 }}>
          <p><label>Event name <input name="name" required /></label></p>
          <p><label>Location <input name="location" maxLength={300} placeholder="Venue, city, or online" /></label></p>
          <p><label>Event type <input name="eventType" required placeholder="Workshop, social, pop-up…" /></label></p>
          <p>Enter dates in your computer’s local timezone.</p>
          <p><label>Start <input id="startAt" type="datetime-local" required /></label></p>
          <input type="hidden" name="startAt" id="startAtValue" />
          <p><label>End (optional) <input id="endAt" type="datetime-local" /></label></p>
          <input type="hidden" name="endAt" id="endAtValue" />
          <p><label>Event cost <input name="cost" type="number" min="0" step="0.01" defaultValue="0" /></label></p>
          <p><label>Description <textarea name="description" /></label></p>
          <p><label>Existing Shopify discount codes <input name="codes" placeholder="EVENT10, EVENTVIP" /></label></p>
          <p>Separate codes with commas. These links track existing discounts; they do not create discounts in Shopify.</p>
          <button type="submit">{fetcher.state !== "idle" ? "Creating…" : "Create event"}</button>
        </fieldset>
      </fetcher.Form>
      <p role="status">{fetcher.data && String("error" in fetcher.data ? fetcher.data.error : fetcher.data.message)}</p>
    </s-section>
    <s-section heading="Your events">
      <s-link href="/app/import">Add attendees</s-link>{" · "}<s-link href="/app/attendance">Update orders</s-link>
      {!events.length && <p>No events yet. Create your first event above.</p>}
      <div className="events-card-grid">
        {events.map((event) => <article className="events-card" key={event.id} aria-label={event.name}>
          <div className="events-card-actions">
            <button type="button" className="event-icon-button" title="Edit event" aria-label={`Edit ${event.name}`} onClick={() => { setSelectedId(event.id); setEditingId(event.id); }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z" /><path d="m14 5 5 5" /></svg>
            </button>
            <button type="button" className="event-icon-button event-icon-delete" title="Delete event" aria-label={`Delete ${event.name}`} disabled={fetcher.state !== "idle"} onClick={() => setRemoval({ intent: "deleteEvent", eventId: event.id, message: `Delete “${event.name}”? This permanently removes the event, its attendee list, and its event-code links from this app. Customers, orders, and Shopify discount codes are kept.` })}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>
            </button>
          </div>
          <button type="button" className="events-card-content" aria-expanded={selectedId === event.id} aria-controls={`event-panel-${event.id}`} onClick={() => { setSelectedId(selectedId === event.id ? null : event.id); setEditingId(null); }}>
            <span className="events-card-name">{event.name}</span>
            <span className="events-card-location"><span>Location</span><strong>{event.location || "Not set"}</strong></span>
            <span className="events-card-counts">
              <span><strong>{event.attendees.length}</strong><span>Total registered</span></span>
              <span><strong>{event.attendees.filter((attendee) => attendee.attended).length}</strong><span>Total attended</span></span>
            </span>
            <span className="events-card-link">{selectedId === event.id ? "Hide details ↑" : "View attendees & orders →"}</span>
          </button>
        </article>)}
      </div>
      {events.map((event) => <div key={event.id} id={`event-panel-${event.id}`} hidden={selectedId !== event.id} className="event-detail-panel">
        {selectedId === event.id && <>
        <h3>{event.name}</h3>
        {editingId === event.id && <EventEditor event={event} onClose={() => setEditingId(null)} />}
        <details><summary>Event reference</summary><code>{event.id}</code></details>
        <p>{event.eventType} · Start: {new Date(event.startAt).toISOString()} · Cost: {event.cost}</p>
        {event.endAt && <p>End: {new Date(event.endAt).toISOString()}</p>}
        {event.description && <p>{event.description}</p>}
        {event.location && <p>Location: {event.location}</p>}
        <p>Linked codes: {codes(event.discountCodes).join(", ") || "None"}. <s-link href="/app/dashboard">Edit codes in dashboard</s-link></p>
        <h3>Attendee details</h3>
        <p>The current import stores email and Shopify customer ID. Names and phone numbers are not currently stored.</p>
        {!event.attendees.length ? <p>No attendees imported yet.</p> : <div style={{ overflowX: "auto" }}><table><thead><tr><th>Email</th><th>Shopify customer</th><th>Registered (UTC)</th><th>Attendance</th><th>Actions</th></tr></thead><tbody>{event.attendees.map((attendee) => <tr key={attendee.id}><td>{attendee.customer.email ?? "Not stored"}</td><td>{attendee.customer.shopifyCustomerId}</td><td>{new Date(attendee.registeredAt).toISOString()}</td><td>{attendee.attended ? "Attended" : "Registered"}</td><td>
          <fetcher.Form method="post" onSubmit={(submission) => {
            submission.preventDefault();
            setRemoval({ intent: "removeAttendee", eventId: event.id, attendeeId: attendee.id, message: `Remove ${attendee.customer.email ?? "this attendee"} from “${event.name}”? Their customer record and other event registrations are kept. Reimporting their CSV row will add them again.` });
          }}>
            <input type="hidden" name="intent" value="removeAttendee" /><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="attendeeId" value={attendee.id} /><input type="hidden" name="confirmed" value="yes" />
            <button className="danger-button" disabled={fetcher.state !== "idle"} aria-label={`Remove ${attendee.customer.email ?? "attendee"} from ${event.name}`}>Remove</button>
          </fetcher.Form>
        </td></tr>)}</tbody></table></div>}
        <h3>Orders using linked codes</h3>
        <p>Purchases using these codes since the event began. Visit Dashboard for totals that count each purchase once.</p>
        {!event.codeOrders.length ? <p>No purchases found yet. Update orders to check for new sales.</p> : <div className="table-scroll"><table><thead><tr><th>Order</th><th>Discount code</th><th>Amount</th><th>Attendee</th></tr></thead><tbody>{event.codeOrders.map((order) => <tr key={order.id}><td>#{order.shopifyOrderId.split("/").pop()}</td><td>{codes(order.discountCodes).join(", ")}</td><td>{order.total.toFixed(2)} {order.currency}</td><td>{event.attendees.find((attendee) => attendee.customerId === order.customerId)?.customer.email ?? "Not on attendee list / email unavailable"}</td></tr>)}</tbody></table></div>}
        </>}
      </div>)}
    </s-section>
  </s-page>;
}
