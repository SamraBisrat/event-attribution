import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  const body = await request.json();

  const {
    name,
    eventType,
    startAt,
    endAt,
    cost,
    description,
  } = body;

  if (!name || !eventType || !startAt) {
    return new Response(
      JSON.stringify({
        error: "name, eventType, and startAt are required",
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  const event = await db.event.create({
    data: {
      shop: session.shop,
      name,
      eventType,
      startAt: new Date(startAt),
      endAt: endAt ? new Date(endAt) : null,
      cost: cost ?? 0,
      description: description ?? null,
    },
  });

  return new Response(
    JSON.stringify({ event }),
    {
      status: 201,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}