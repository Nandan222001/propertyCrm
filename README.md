# NMT Real Estate ERP — Demo MVP

A React + Vite client-demo MVP based on the NMT Solution Real Estate Plot Management & Sales ERP proposal.

## Run locally

```sh
npm install
npm run dev
```

## Demo modules

- Management dashboard with sales, collections, inventory charts, recent bookings, and payment follow-ups.
- Project portfolio, plot inventory table, status filters, and a clickable plotted-layout view.
- Booking workflow with customer, project, plot, agent, and payment-plan details. Creating a booking updates the local plot status.
- Payment ledger with paid, pending, overdue and partial statuses, plus record-payment workflow.
- Customer directory and linked customer profile, timeline, outstanding balance and document list.
- Agent performance and profile summary; commission eligibility, approval and payout views.
- Sales, plots, booking, collection, ageing, agent, commission, daily, ledger and cancellation report library.
- Sample document management, notification/follow-up queue, permission matrix/role preview, admin settings and activity log.
- CSV export and browser-persisted demo bookings/plot changes (`localStorage`). Responsive layout for desktop, tablet, mobile and narrow screens.
- React Router deep links: `/`, `/projects-plots`, `/bookings`, `/payments`, `/customers`, `/customers/detail`, `/agents`, `/commissions`, `/reports`, `/documents`, `/notifications`, `/user-roles` and `/administration`. Vercel SPA rewrites support direct links and refresh.

All records and figures are illustrative. Demo sign-in supports selectable roles (any valid email and password of four or more characters); the seeded admin example is `admin@nmtsolution.demo` / `demo123`. Role sessions and user records are browser-local only. This is not production authentication; multi-user persistence, password security, real payment processing, messaging, uploads, and server-backed reporting require a backend integration.

## CRUD demo behavior

Every module route now includes a module-scoped record workspace with create, view, edit and delete controls. Module records, bookings, plots and payments are stored in browser `localStorage` for the client demo. Delete asks for confirmation. This is intentionally client-side; these records are not shared between users or devices until a server API/database is connected.

## Workflow rules (demo)

- **Bookings:** admins and sales agents create them. An agent's booking is `Pending Approval` (plot on hold) until an admin approves it on the **Approvals** page; admin bookings are confirmed immediately.
- **Customers:** only sales agents add customers; each one needs admin approval before it can be booked.
- **Payments:** accounts/admin pick the plot from a drop-down, confirm the *final price for the customer*, and record the amount. A bill is generated with an **office copy** and a **customer copy** (one A4 page when printed) and can be shared with the customer.
- **Customer login** (`customer@nmtsolution.demo`): view-only portal with plots, registry status, payments, pending dues, bills and documents.
- **Agent search** on the admin dashboard shows an agent's deals, sales, collection and commission.
- **3D map:** *Projects & plots → 3D map* (tilt / rotate / zoom, click a plot).
- **WhatsApp:** buttons open WhatsApp click-to-chat with a prefilled message (bills, reminders, booking notices). Automatic sending would need the WhatsApp Business API and a backend.
- All data is stored in the browser (`localStorage`); there is no server.
