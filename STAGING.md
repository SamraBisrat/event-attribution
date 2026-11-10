# Render staging

## Prepared configuration

`render.yaml` defines one paid Docker web service in Ohio with a 1 GB persistent disk, manual deploys, and a `/health` database readiness check. Review current charges in Render before creating it. Nothing in this file provisions a service until applied in Render.

This is an isolated, single-instance test environment using SQLite. Its new database is `/var/data/staging.sqlite`. Local development continues to use `file:dev.sqlite`. Do not upload the local database, `.env`, Shopify sessions, customer exports, or encryption backups. A managed PostgreSQL migration remains recommended before scaling production. Persistent disks prevent data loss on redeploy; they are not a tested database backup strategy.

## Account setup and deployment

1. Put the reviewed app source in a private Git repository, including all required currently untracked app files and migrations. Exclude local data and credentials. No repository has been pushed by this preparation.
2. Create a separate Shopify staging app and use a development/test store. Keep the existing app's credentials and URLs unchanged. The staging app needs customer/order read access and its own applicable protected customer data access. Order history beyond 60 days requires additional Shopify access.
3. In Render, choose New → Blueprint and connect that repository. Review `render.yaml` and the paid service/disk charges.
4. Enter `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` for the staging Shopify app in Render's environment settings. Set `SHOPIFY_APP_URL` to the service's actual HTTPS URL from Render. Never paste secrets in chat or commit them.
5. Create a new 32-byte base64 encryption key for `APP_DATA_KEY`, store it in Render, and retain a separate password-manager copy. Generate it locally with `node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))'`. Keep the value private. Do not change it after storing encrypted staging records.
6. Configure the separate Shopify app's application URL and authentication redirects for that actual Render hostname using Shopify's deployment instructions. Deploy a separate staging Shopify configuration; do not run the default deploy against the existing app. This registration step is still pending and no staging Shopify config has been linked yet.
7. Start the Render deployment. Startup runs Prisma migrations on the mounted disk before starting the server. Do not move migrations into a pre-deploy command: that environment does not mount the disk. Open `/health` and confirm `{"status":"ok"}`.
8. Install the staging app on the test store and complete the checks below. Shopify app configuration deployment alone does not deploy the web server.

## Acceptance checks

- Open the embedded app and verify authentication and navigation.
- Create an event with location and a test discount code; import a test attendee.
- Edit the event and verify the tile, attendance view and dashboard use updated details.
- Create test orders and refresh; check attendance/code attribution and dashboard CSV totals.
- Check automatic refresh while the app is open. Closed-app background syncing is not implemented.
- Verify attendee removal and event deletion confirmation using disposable test records.
- Redeploy/restart the service and verify the event and session data persist.
- Test encrypted database backup and restoration together with the separately stored key before relying on staging data. Do not run the local `encrypt-data.mjs` maintenance script on this environment.

## Validation limits

Local checks cover types, build, tests and migrations against temporary SQLite databases. Docker is not installed on the current machine, so a container build and hosted authentication still require verification on Render. Hosting, a connected Git repository, staging Shopify credentials and the final service URL have not been provisioned.

References: https://render.com/docs/deploy-shopify-app, https://render.com/docs/disks, https://render.com/docs/blueprint-spec, https://shopify.dev/docs/apps/launch/deployment/deploy-web-app
