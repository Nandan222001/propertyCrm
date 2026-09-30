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
- CSV export and browser-persisted demo bookings/plot changes (`localStorage`). Responsive layout for desktop and mobile.

All records and figures are illustrative. This is a front-end demo with local browser state; production authentication, multi-user persistence, real payment processing, messaging, uploads, and server-backed reporting require a backend integration.
