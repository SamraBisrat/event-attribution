
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// GET /api/events — list events for the authenticated store
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const events = await db.event.findMany({
    where: {
      shop: session.shop,
    },
    orderBy: {
      startAt: "asc",
    },
  });

  return jsonResponse({ events });
}

// POST /api/events — create an event
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { name, eventType, startAt, endAt, cost, description, location } = body;
  if (location !== undefined && location !== null && (typeof location !== "string" || location.length > 300)) return jsonResponse({ error: "location must be text of at most 300 characters" }, 400);

  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof eventType !== "string" ||
    !eventType.trim() ||
    typeof startAt !== "string" ||
    !startAt.trim()
  ) {
    return jsonResponse(
      { error: "name, eventType, and startAt are required" },
      400,
    );
  }

  const startDate = new Date(startAt);
  const endDate = endAt ? new Date(String(endAt)) : null;

  if (
    Number.isNaN(startDate.getTime()) ||
    (endDate && Number.isNaN(endDate.getTime()))
  ) {
    return jsonResponse(
      { error: "startAt or endAt is not a valid date" },
      400,
    );
  }

  if (
    cost !== undefined &&
    (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0)
  ) {
    return jsonResponse(
      { error: "cost must be a non-negative number" },
      400,
    );
  }

  const event = await db.event.create({
    data: {
      shop: session.shop,
      name: name.trim(),
      location: typeof location === "string" ? location.trim() || null : null,
      eventType: eventType.trim(),
      startAt: startDate,
      endAt: endDate,
      cost: typeof cost === "number" ? cost : 0,
      description:
        typeof description === "string" && description.trim()
          ? description.trim()
          : null,
    },
  });

  return jsonResponse({ event }, 201);
}
