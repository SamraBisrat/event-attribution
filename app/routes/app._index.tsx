import { Link } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return null;
}

export default function Overview() {
  return <>
    <section className="hero"><h1>Make every event count.</h1><p>Keep your events, attendees, and sales in one place. Start with an event, then follow the results.</p><Link className="button-link" to="/app/events">Create an event</Link></section>
    <section className="card"><h2>Your next steps</h2><div className="table-scroll"><table><thead><tr><th>Step</th><th>What to do</th><th>Get started</th></tr></thead><tbody>
      <tr><td>01 · Set up</td><td>Add your event dates and any discount codes you’ll share.</td><td><Link to="/app/events">Manage events →</Link></td></tr>
      <tr><td>02 · Add people</td><td>Upload your attendee spreadsheet. Matched attendees are confirmed automatically.</td><td><Link to="/app/import">Add attendees →</Link></td></tr>
      <tr><td>03 · Update sales</td><td>Bring in recent Shopify purchases before checking your results.</td><td><Link to="/app/attendance">Update orders →</Link></td></tr>
      <tr><td>04 · See the impact</td><td>Compare events, track code usage, and explore customer spending.</td><td><Link to="/app/dashboard">View dashboard →</Link></td></tr>
    </tbody></table></div><p>Orders refresh automatically while the app is open. Attendance &amp; Orders shows your last successful update.</p></section>
  </>;
}
