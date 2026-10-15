import React from 'react';
import { Shield, Info, CheckCircle2, Lock, Eye } from 'lucide-react';
import { roleConfigs } from '../../data/appConfig';

export function RoleContextBanner({ role, page }) {
  const cfg = roleConfigs[role] || roleConfigs['ADMIN'];

  const pageDescriptions = {
    'Tenants': {
      'SUPER ADMIN': 'Platform Console — Onboard organisations, assign their administrators, manage plans and seat limits, and suspend or reactivate access. Tenant business data is never shown here.'
    },
    'Projects & plots': {
      'ADMIN': 'Operations Command — Add new projects, manage master plot inventory, reassign plots, and oversee project delivery schedules.',
      'SALES MANAGER': 'Sales Manager View — Monitoring inventory availability across phases, tracking plot reservations, and reviewing hold requests.',
      'SALES AGENT': 'Sales Agent View — Filter and search available plots for your active clients. Instant pricing calculation and reservation hold actions.',
      'ACCOUNTS': 'Accounts View — Track plot payment completion percentage, cost per sqft realization, and outstanding installment balances.'
    },
    'Bookings': {
      'ADMIN': 'Operations Command — Full booking register, installment plan modifications, customer reassignment, and formal allotment execution.',
      'SALES MANAGER': 'Leadership Desk — Review pipeline bookings from your sales force. Sign off on agreement approvals and booking holds.',
      'SALES AGENT': 'My Deals Desk — Create and manage bookings for your customers. Track token advance receipts and milestone agreement statuses.',
      'ACCOUNTS': 'Treasury Desk — Reconcile advance payments against booking contracts, generate official customer receipts, and verify banking instruments.'
    },
    'Payments': {
      'ADMIN': 'Operations Command — Overview of cash collections, customer installment tracking, and pending installment reminders.',
      'SALES MANAGER': 'Sales Leadership — Track collection velocity across agents to ensure deals are backed by cleared payments.',
      'SALES AGENT': 'Deal Realization — View payment clearance statuses for your clients to track when your commission milestone unlocks.',
      'ACCOUNTS': 'Treasury & Ledger Desk — Full authority to record customer payments (NEFT, Cheque, UPI), issue tax invoices, and escalate overdue defaulters.'
    },
    'Billing': {
      'ADMIN': 'Operations Command — Raise instalment and service-charge bills against bookings, issue them for collection, and download print-ready PDFs.',
      'SALES MANAGER': 'Sales Leadership — Review the invoice book for your team\'s bookings: billed, collected, outstanding and overdue positions.',
      'ACCOUNTS': 'Billing Desk — Full authority to draft line-item GST invoices, issue bills, record collections (auto receipt + ledger), and share PDF bills.',
      'CUSTOMER': 'My Bills — View and download the tax invoices raised for your bookings, with payment status and balance due.'
    },
    'Commissions': {
      'ADMIN': 'Operations Command — Manage agent eligibility, tier qualifications, and verify deal attribution.',
      'SALES MANAGER': 'Sales Leadership — Review agent deal performance and approve monthly commission slips for the team.',
      'SALES AGENT': 'My Commission Statement — View your personal earnings at your agreed commission rate, the TDS deduction breakdown, and bank payout dates.',
      'ACCOUNTS': 'Disbursement Desk — Calculate TDS (5%), generate Form 16A slips, and process electronic NEFT disbursements to agent bank accounts.'
    },
    'Expenses': {
      'ADMIN': 'Operations Command — Track every company expense and see profit till date: collections less agent commission less expenses.',
      'ACCOUNTS': 'Expense Desk — Record office, marketing, legal and development spends. Company profit updates as you add them.'
    },
    'Reports': {
      'ADMIN': 'Operations BI — Comprehensive operations reports across projects, bookings, payments, and agent throughput.',
      'SALES MANAGER': 'Sales BI — Agent leaderboard rankings, lead-to-booking conversion funnel velocity, and lost deal analysis.',
      'SALES AGENT': 'Personal BI — My Monthly Sales Target realization curve and customer inquiry conversion ratios.',
      'ACCOUNTS': 'Financial BI — Accounts Receivable aging schedules, daily bank reconciliation statements, and GST/Tax liability reports.'
    },
    'Notifications': {
      'ADMIN': 'Operations Alerts — Customer booking agreements ready, project milestones, and pending staff requests.',
      'SALES MANAGER': 'Sales Alerts — Deal reservation hold requests, agent milestone achievements, and urgent customer inquiries.',
      'SALES AGENT': 'My Follow-up Alerts — Upcoming customer site visits, appointment reminders, and allotment letter notices.',
      'ACCOUNTS': 'Billing Alerts — Overdue customer payment milestones, bounce cheques, and pending NEFT reconciliations.'
    }
  };

  const desc = pageDescriptions[page]?.[role] || `Viewing ${page} with ${role} permissions and customized workspace controls.`;

  return (
    <div className="role-context-banner" style={{ borderLeftColor: cfg.color }}>
      <div className="banner-left">
        <span className="role-chip" style={{ background: cfg.bg, color: cfg.color }}>
          <Shield size={12} /> {role} VIEW
        </span>
        <div className="banner-text">
          <p>{desc}</p>
        </div>
      </div>
      <div className="banner-right">
        <span className="perm-badge">
          <CheckCircle2 size={12} className="green-text" /> Role-Adapted View
        </span>
      </div>
    </div>
  );
}
