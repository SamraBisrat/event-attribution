
import type { ActionFunctionArgs } from "react-router";
import { parse } from "csv-parse/sync";
import { authenticate } from "../shopify.server";
import db from "../db.server";

import { importAttendees, type CsvAttendee } from "../import-attendees.server";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const routeEventId = params.eventId;

  if (!routeEventId) {
    return jsonResponse({ error: "Missing event ID in URL" }, 400);
  }

  const event = await db.event.findFirst({
    where: { id: routeEventId, shop: session.shop },
  });

  if (!event) {
    return jsonResponse({ error: "Event not found" }, 404);
  }

  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonResponse(
      { error: "Upload a CSV file using multipart/form-data with field name 'file'" },
      400,
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return jsonResponse({ error: "CSV file is required in field 'file'" }, 400);
  }

  if (file.size === 0 || file.size > 5 * 1024 * 1024) {
    return jsonResponse(
      { error: "CSV file must be non-empty and no larger than 5 MB" },
      400,
    );
  }

  let rows: CsvAttendee[];

  try {
    rows = parse(await file.text(), {
      bom: true,
      columns: (headers: string[]) => headers.map((header) => header.trim()),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: false,
    }) as CsvAttendee[];
  } catch {
    return jsonResponse(
      { error: "Could not parse CSV. Check its headers and formatting." },
      400,
    );
  }

  const requiredHeaders = ["Event ID", "First name", "Last name", "Email"];
  if (
    rows.length === 0 ||
    !requiredHeaders.every((header) =>
      Object.prototype.hasOwnProperty.call(rows[0], header),
    )
  ) {
    return jsonResponse(
      { error: "CSV must contain: Event ID, First name, Last name, Email" },
      400,
    );
  }

  if (rows.length > 5000) {
    return jsonResponse({ error: "Maximum 5,000 attendee rows per import" }, 400);
  }

  try {
    const results = await importAttendees(db, session.shop, event.id, rows);
    return jsonResponse({ eventId: event.id, ...results });
  } catch {
    return jsonResponse({ error: "Import could not be saved. No rows from this upload were saved. Please try again." }, 500);
  }
}
