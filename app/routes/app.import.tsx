import { useState, type FormEvent } from "react";
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const events = await db.event.findMany({
    where: { shop: session.shop },
    orderBy: { startAt: "desc" },
    select: { id: true, name: true },
  });
  return { events };
}

type ImportResult = {
  error?: string;
  details?: string[];
  imported?: number;
  alreadyRegistered?: number;
  unmatched?: { row: number; email: string }[];
  invalid?: { row: number; reason: string }[];
  eventMismatch?: { row: number; eventId: string }[];
};

export default function ImportAttendees() {
  const { events } = useLoaderData<typeof loader>();
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/attendees/import`, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });
      if (response.status === 401 || response.status === 403) {
        setResult({ error: "Your session could not be verified. Reopen this app from Shopify admin and try again." });
      } else if (!response.headers.get("content-type")?.includes("application/json")) {
        setResult({ error: "The app returned an unexpected response. Reopen it from Shopify admin and try again." });
      } else {
        const payload = await response.json() as ImportResult;
        setResult(response.ok ? payload : { ...payload, error: payload.error ?? "Import failed. Please try again." });
      }
    } catch {
      setResult({ error: "Could not reach the app. Check that the development server is running. Some rows may have been saved; retrying skips existing registrations." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <s-page heading="Import attendees">
      <s-section heading="Upload your attendee CSV">
        {events.length === 0 ? <p><s-link href="/app/events">Create your first event</s-link> before adding attendees.</p> : (
          <form onSubmit={upload}>
            <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
              <p><label htmlFor="event">Event</label></p>
              <select id="event" value={eventId} onChange={(event) => { setEventId(event.target.value); setResult(null); }} required>
                {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
              </select>
              <p>Download the template for this event, fill in your attendees, then upload it below.</p>
              <a className="button-link" download="attendees-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(`Event ID,First name,Last name,Email,Phone number\n${eventId},,,,\n`)}`}>Download spreadsheet template</a>
              <p>Required headers: Event ID, First name, Last name, Email. Optional: Phone number. An email is required for purchase matching; no Shopify account or prior purchase is needed. Maximum file size: 5 MB; maximum rows: 5,000.</p>
              <p><label htmlFor="file">Attendee CSV</label></p>
              <input id="file" name="file" type="file" accept=".csv,text/csv" required />
              <p><button type="submit">{busy ? "Importing…" : "Import attendees"}</button></p>
            </fieldset>
          </form>
        )}
        <div aria-live="polite" role="status">
          {result?.error ? <><p>{result.error}</p>{result.details?.map((detail, index) => <p key={index}>{detail}</p>)}</> : result && (
            <>
              <p>Import complete: {result.imported ?? 0} imported, {result.alreadyRegistered ?? 0} already registered.</p>
              <p>{result.invalid?.length ?? 0} invalid rows; {result.eventMismatch?.length ?? 0} rows for another event.</p>
              <details><summary>Rows that need attention</summary><div className="table-scroll"><table><thead><tr><th>Spreadsheet row</th><th>Issue</th></tr></thead><tbody>
                {result.invalid?.map((item) => <tr key={`invalid-${item.row}`}><td>{item.row}</td><td>{item.reason}</td></tr>)}
                {result.eventMismatch?.map((item) => <tr key={`event-${item.row}`}><td>{item.row}</td><td>This row belongs to another event. Use the template for your selected event.</td></tr>)}
              </tbody></table></div></details>
              <p>All imported attendees are automatically confirmed as attended, including existing registrations.</p>
            </>
          )}
        </div>
      </s-section>
    </s-page>
  );
}
