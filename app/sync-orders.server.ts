import type { PrismaClient } from "@prisma/client";
import { orderValues, ordersQuery, type RemoteOrder } from "./order-sync.server.ts";
import { normalizedEmail } from "./customer-identity.server.ts";
type Admin = { graphql: (query: string, options: { variables: { after: string | null; query: string } }) => Promise<Response> };
const active = new Map<string, Promise<{ message: string }>>();

export function syncQuery(fullHistory: boolean, lastSuccess: Date | null, now: Date) {
  const filters = fullHistory ? [] : [`created_at:>=${new Date(now.getTime() - 59 * 86400000).toISOString()}`];
  if (lastSuccess) filters.push(`updated_at:>=${new Date(lastSuccess.getTime() - 5 * 60000).toISOString()}`);
  return filters.join(" ");
}

export async function syncOrders(db: PrismaClient, admin: Admin, shop: string, scopes: string) {
  if (active.has(shop)) return active.get(shop)!;
  const task = (async () => {
    const granted = scopes.split(",").map((scope) => scope.trim());
    if (!granted.some((scope) => ["read_orders", "write_orders"].includes(scope))) throw new Error("Order access is required. Reopen the app and accept its order permissions.");
    const fullHistory = granted.includes("read_all_orders");
    const state = await db.orderSyncState.findUnique({ where: { shop } });
    const started = new Date();
    if (state && state.fullHistory === fullHistory && started.getTime() - state.lastSuccessAt.getTime() < 60000) return { message: "Orders are up to date." };
    const query = syncQuery(fullHistory, state?.fullHistory === fullHistory ? state.lastSuccessAt : null, started);
    let after: string | null = null;
    const orders: RemoteOrder[] = [];
    for (let page = 0; page < 100; page++) {
      const response: Response = await admin.graphql(ordersQuery, { variables: { after, query } });
      const payload: { errors?: unknown[]; data?: { orders: { nodes: RemoteOrder[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } } = await response.json();
      if (!response.ok || payload.errors?.length || !payload.data?.orders) throw new Error("Shopify could not complete the update. Check order access and try again. Saved sales have been kept.");
      const connection = payload.data.orders;
      orders.push(...connection.nodes);
      if (!connection.pageInfo.hasNextPage) break;
      if (!connection.pageInfo.endCursor || connection.pageInfo.endCursor === after || page === 99) throw new Error("This sync is too large or could not finish. Saved sales have been kept; contact support for a bulk history import.");
      after = connection.pageInfo.endCursor;
    }
    for (const order of orders) orderValues(order);
    await db.$transaction(async (transaction) => {
      const customers = new Map<string, string>();
      for (const remoteId of new Set(orders.flatMap((order) => order.customer ? [order.customer.id] : []))) {
        const remoteOrders = orders.filter((order) => order.customer?.id === remoteId);
        const email = normalizedEmail(remoteOrders.find((order) => order.customer?.defaultEmailAddress?.emailAddress)?.customer?.defaultEmailAddress?.emailAddress) ?? normalizedEmail(remoteOrders.find((order) => order.email)?.email);
        const customer = await transaction.customer.upsert({ where: { shop_shopifyCustomerId: { shop, shopifyCustomerId: remoteId } }, create: { shop, shopifyCustomerId: remoteId, email }, update: email ? { email } : {} });
        customers.set(remoteId, customer.id);
      }
      for (const order of orders) {
        const values = { ...orderValues(order), email: normalizedEmail(order.email) ?? normalizedEmail(order.customer?.defaultEmailAddress?.emailAddress), customerId: order.customer ? customers.get(order.customer.id) ?? null : null };
        await transaction.order.upsert({ where: { shop_shopifyOrderId: { shop, shopifyOrderId: order.id } }, create: { shop, shopifyOrderId: order.id, ...values }, update: values });
      }
      await transaction.orderSyncState.upsert({ where: { shop }, create: { shop, lastSuccessAt: started, fullHistory }, update: { lastSuccessAt: started, fullHistory } });
    }, { timeout: 60000 });
    return { message: `Updated ${orders.length} orders. ${fullHistory ? "Full order-history access enabled." : "History is limited to recent orders until Shopify grants full-history access."}` };
  })();
  active.set(shop, task);
  try { return await task; } finally { active.delete(shop); }
}
