
import type { ActionFunctionArgs } from "react-router";
import { parse } from "csv-parse/sync";
import { authenticate } from "../shopify.server";
import db from "../db.server";

type CsvAttendee = {
  "Event ID": string;
  "First name": string;
  "Last name": string;
  Email: string;
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
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

  const results = {
    imported: 0,
    alreadyRegistered: 0,
    unmatched: [] as { row: number; email: string }[],
    invalid: [] as { row: number; reason: string }[],
    eventMismatch: [] as { row: number; eventId: string }[],
  };

  const validRows = rows.map((row, index) => ({
    row,
    line: index + 2,
    eventId: (row["Event ID"] ?? "").trim(),
    email: (row.Email ?? "").trim().toLowerCase(),
  }));

  for (const item of validRows) {
    if (!item.eventId || !item.email) {
      results.invalid.push({
        row: item.line,
        reason: "Event ID and Email are required",
      });
    } else if (item.eventId !== event.id) {
      results.eventMismatch.push({
        row: item.line,
        eventId: item.eventId,
      });
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email)) {
      results.invalid.push({
        row: item.line,
        reason: "Invalid email address",
      });
    }
  }

  const eligibleRows = validRows.filter(
    (item) =>
      item.eventId === event.id &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email),
  );

  const emails = [...new Set(eligibleRows.map((item) => item.email))];
  const customersByEmail = new Map<
    string,
    { id: string; email: string | null; shopifyCustomerId: string }
  >();

  for (const email of emails) {
    const query = await admin.graphql(
      `#graphql
        query FindCustomerByEmail($query: String!) {
          customers(first: 10, query: $query) {
            nodes {
              id
              email
            }
          }
        }`,
      { variables: { query: `email:${JSON.stringify(email)}` } },
    );

    if (!query.ok) {
      return jsonResponse(
        { error: "Shopify customer lookup failed", detail: `HTTP ${query.status}` },
        502,
      );
    }

    const payload = await query.json() as {
      errors?: { message: string }[];
      data?: {
        customers?: {
          nodes: { id: string; email: string | null }[];
        };
      };
    };

    if (payload.errors?.length || !payload.data?.customers) {
      return jsonResponse(
        {
          error: "Shopify customer lookup failed",
          details: ["Check customer access permissions in Shopify, then try again."],
        },
        502,
      );
    }

    const matches = payload.data.customers.nodes.filter(
      (customer) => customer.email?.trim().toLowerCase() === email,
    );

    if (matches.length !== 1) {
      continue;
    }

    const shopifyCustomer = matches[0];

    const customer = await db.customer.upsert({
      where: {
        shop_shopifyCustomerId: {
          shop: session.shop,
          shopifyCustomerId: shopifyCustomer.id,
        },
      },
      update: { email },
      create: {
        shop: session.shop,
        shopifyCustomerId: shopifyCustomer.id,
        email,
      },
    });

    customersByEmail.set(email, customer);
  }

  for (const item of eligibleRows) {
    const customer = customersByEmail.get(item.email);

    if (!customer) {
      results.unmatched.push({ row: item.line, email: item.email });
      continue;
    }

    const existingRegistration = await db.eventAttendee.findUnique({
  where: {
    eventId_customerId: {
      eventId: event.id,
      customerId: customer.id,
    },
  },
});

if (existingRegistration) {
  await db.eventAttendee.update({
    where: { id: existingRegistration.id },
    data: { attended: true },
  });
  results.alreadyRegistered++;
} else {
  await db.eventAttendee.create({
    data: {
      eventId: event.id,
      customerId: customer.id,
      attended: true,
    },
  });

  results.imported++;
}
  }

  return jsonResponse({ eventId: event.id, ...results });
}
