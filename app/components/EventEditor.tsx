import { useFetcher } from "react-router";
import type { Event } from "@prisma/client";

function localDate(value: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, -1);
}

export function EventEditor({ event, onClose }: { event: Omit<Event, "startAt" | "endAt" | "createdAt" | "updatedAt"> & { startAt: Date | string; endAt: Date | string | null }; onClose: () => void }) {
  const fetcher = useFetcher<{ error?: string; message?: string }>();
  let discountCodes: string[] = [];
  try { discountCodes = JSON.parse(event.discountCodes); } catch { /* Legacy events may have no codes. */ }
  return <div className="event-editor">
    <h3>Edit event</h3>
    <fetcher.Form method="post" onSubmit={(submission) => {
      const form = submission.currentTarget;
      for (const field of ["startAt", "endAt"]) {
        const input = form.elements.namedItem(`${field}Local`) as HTMLInputElement;
        const hidden = form.elements.namedItem(field) as HTMLInputElement;
        const original = event[field as "startAt" | "endAt"];
        hidden.value = input.value === localDate(original) && original ? new Date(original).toISOString() : input.value ? new Date(input.value).toISOString() : "";
      }
    }}>
      <input type="hidden" name="intent" value="update" />
      <input type="hidden" name="eventId" value={event.id} />
      <fieldset disabled={fetcher.state !== "idle"} style={{ border: 0, padding: 0 }}>
        <p><label>Event name <input name="name" required defaultValue={event.name} /></label></p>
        <p><label>Location <input name="location" maxLength={300} defaultValue={event.location ?? ""} placeholder="Venue, city, or online" /></label></p>
        <p><label>Event type <input name="eventType" required defaultValue={event.eventType} /></label></p>
        <p>Dates use your computer’s local timezone. Changing dates or discount codes updates the event’s reporting.</p>
        <p><label>Start <input name="startAtLocal" type="datetime-local" step="any" required defaultValue={localDate(event.startAt)} /></label></p>
        <input type="hidden" name="startAt" />
        <p><label>End (optional) <input name="endAtLocal" type="datetime-local" step="any" defaultValue={localDate(event.endAt)} /></label></p>
        <input type="hidden" name="endAt" />
        <p><label>Event cost <input name="cost" type="number" min="0" step="0.01" defaultValue={event.cost} /></label></p>
        <p><label>Description <textarea name="description" defaultValue={event.description ?? ""} /></label></p>
        <p><label>Existing Shopify discount codes <input name="codes" defaultValue={discountCodes.join(", ")} placeholder="EVENT10, EVENTVIP" /></label></p>
        <p>Separate codes with commas. These links track existing discounts in Shopify.</p>
        <button type="submit">{fetcher.state !== "idle" ? "Saving…" : "Save changes"}</button>{" "}
        <button type="button" onClick={onClose}>{fetcher.data?.message ? "Done" : "Cancel"}</button>
      </fieldset>
    </fetcher.Form>
    <p role={fetcher.data?.error ? "alert" : "status"}>{fetcher.data?.error ?? fetcher.data?.message}</p>
  </div>;
}
