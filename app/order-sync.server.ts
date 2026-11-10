export type RemoteOrder = {
  id: string;
  discountCodes?: string[];
  createdAt: string;
  customer: { id: string } | null;
  cancelledAt: string | null;
  test: boolean;
  displayFinancialStatus: string;
  currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
};

export function orderValues(order: RemoteOrder) {
  const amount = Number(order.currentTotalPriceSet.shopMoney.amount);
  const orderDate = new Date(order.createdAt);
  if (!Number.isFinite(amount) || amount < 0 || Number.isNaN(orderDate.getTime())) {
    throw new Error("Shopify returned an invalid order amount or date.");
  }
  const eligible = !order.cancelledAt && !order.test &&
    ["PAID", "PARTIALLY_REFUNDED"].includes(order.displayFinancialStatus);
  return {
    orderDate,
    total: eligible ? amount : 0,
    currency: order.currentTotalPriceSet.shopMoney.currencyCode,
    discountCodes: JSON.stringify(order.discountCodes ?? []),
  };
}

export const ordersQuery = `#graphql
  query SyncOrders($after: String, $query: String!) {
    orders(first: 100, after: $after, query: $query, sortKey: UPDATED_AT) {
      nodes {
        id createdAt cancelledAt test displayFinancialStatus discountCodes
        customer { id }
        currentTotalPriceSet { shopMoney { amount currencyCode } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;
