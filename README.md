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

All records and figures are illustrative. This is a front-end demo with local browser state; production authentication, multi-user persistence, real payment processing, messaging, uploads, and server-backed reporting require a backend integration.

## CRUD demo behavior

Every module route now includes a module-scoped record workspace with create, view, edit and delete controls. Module records, bookings, plots and payments are stored in browser `localStorage` for the client demo. Delete asks for confirmation. This is intentionally client-side; these records are not shared between users or devices until a server API/database is connected.
