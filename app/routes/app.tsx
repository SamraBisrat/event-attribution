import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { NavLink, Outlet, useLoaderData, useRouteError } from "react-router";
import "../styles/theme.css";
import { AutomaticOrderSync } from "../components/automatic-order-sync";
import type {} from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/events">Events</s-link>
        <s-link href="/app/dashboard">Dashboard</s-link>
        <s-link href="/app/import">Import attendees</s-link>
        <s-link href="/app/attendance">Attendance and sales</s-link>
      </s-app-nav>
      <div className="event-app">
        <header className="brand">Event insights</header>
        <nav className="tabs" aria-label="Main navigation"><NavLink to="/app" end>Overview</NavLink><NavLink to="/app/events">Events</NavLink><NavLink to="/app/import">Add attendees</NavLink><NavLink to="/app/attendance">Attendance &amp; orders</NavLink><NavLink to="/app/dashboard">Dashboard</NavLink></nav>
        <main><AutomaticOrderSync /><Outlet /></main>
      </div>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
