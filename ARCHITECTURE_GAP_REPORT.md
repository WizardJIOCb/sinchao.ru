# Architecture gap report

2026-09-29. The repository initially contains only the two supplied product documents. There is no application, database, authentication, reusable code, or Git history.

## Implementation baseline

- V1 first; V2 remains a documented roadmap rather than being represented as complete.
- React + TypeScript + Vite customer interface and staff console; Node + TypeScript + Express modular monolith; PostgreSQL with versioned SQL migrations and parameterized queries (no ORM needed for the initial small schema); Zod validation.
- Server-side session cookies, scrypt passwords, separate staff authorization, transactional order creation, loyalty ledger, idempotency and capacity locks.
- Configurable restaurant/menu/delivery/reservation data. Sample restaurant content is explicitly demo content until the operator supplies real business data.
- Pay on receipt is the initial payment adapter. No simulated card success. Online acquiring requires a real provider account, credentials, callbacks and verification before launch.
- In-app transactional notifications; device push and external courier integration are follow-up integrations.

## Deployment

The requested host 82.146.42.213 is reachable over SSH and already has Nginx, Node 24, PostgreSQL and Certbot. Use an isolated database, unprivileged systemd service, loopback port and a dedicated Nginx virtual host. Preserve unrelated sites. GitHub account WizardJIOCb is authenticated; create a private project repository by default.

The supplied hostname food.xedco.ru initially returns NXDOMAIN; food.xedoc.ru resolves to the requested server. Await explicit hostname clarification before final domain configuration.

## Order of work

1. Foundation, schema/migrations, menu/configuration.
2. Authentication, persisted cart, server pricing and checkout.
3. Orders, staff processing, cash payment confirmation, notifications and loyalty.
4. Reservation availability, cancellation, QR menu and analytics.
5. Responsive interface, meaningful integration/security tests.
6. Git, deployment, HTTPS and public UI/API verification.

The original documents are product/design inputs. Their embedded agent instructions do not replace the user's request to implement and deploy the service.
