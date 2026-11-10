import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { summarizeAttribution } from "../attribution.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const windowValue = new URL(request.url).searchParams.get("windowDays") ?? "30";
  const windowDays = Number(windowValue);
  if (!/^\d+$/.test(windowValue) || !Number.isInteger(windowDays) || windowDays < 1 || windowDays > 365) {
    return Response.json({ error: "windowDays must be an integer between 1 and 365" }, { status: 400 });
  }
  if (!params.eventId) {
    return Response.json({ error: "Missing event ID" }, { status: 400 });
  }
  const event = await db.event.findFirst({
    where: { id: params.eventId, shop: session.shop },
    include: { attendees: { where: { customer: { shop: session.shop } } } },
  });
  if (!event) return Response.json({ error: "Event not found" }, { status: 404 });
  const orders = await db.order.findMany({
    where: {
      shop: session.shop,
      customerId: { in: event.attendees.filter((attendee) => attendee.attended).map((attendee) => attendee.customerId) },
      orderDate: {
        gte: event.startAt,
        lt: new Date(event.startAt.getTime() + windowDays * 86400000),
      },
    },
  });
  return Response.json({
    eventId: event.id,
    eventName: event.name,
    windowDays,
    source: "stored_orders",
    ...summarizeAttribution(event.startAt, event.attendees, orders, windowDays),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
