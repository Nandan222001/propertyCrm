import React from 'react';
import { PAGES } from '../../constants/navigation';
import { RoleContextBanner } from '../../components/layout/RoleContextBanner';

/** Where "Take Action" goes for each kind of notification (first page the role may open). */
const TARGETS = {
  APPROVAL: [PAGES.APPROVALS, PAGES.BOOKINGS, PAGES.CUSTOMERS],
  PAYMENT_OVERDUE: [PAGES.PAYMENTS, PAGES.BILLING],
  REGISTRY: [PAGES.BOOKINGS, PAGES.DOCUMENTS],
  FOLLOW_UP: [PAGES.BOOKINGS],
  SYSTEM: [PAGES.ADMIN],
};

/** Offline-preview samples. Each carries the roles that would actually receive it. */
const DEMO = [
  { id: 'd1', title: 'Payment overdue · Sneha Mehta', body: 'Plot B-033 · ₹5,60,000 is 10 days overdue.', category: 'PAYMENT_OVERDUE', severity: 'warning', roles: ['ACCOUNTS', 'ADMIN'] },
  { id: 'd2', title: 'Booking awaiting approval', body: 'Meena Kapoor · Plot C-044 submitted by an agent.', category: 'APPROVAL', severity: 'info', roles: ['ADMIN'] },
  { id: 'd3', title: 'Customer awaiting approval', body: 'A customer added by an agent needs sign-off.', category: 'APPROVAL', severity: 'info', roles: ['ADMIN'] },
  { id: 'd4', title: 'Registry milestone', body: 'Plot A-101 agreement signed — sub-registrar appointment pending.', category: 'REGISTRY', severity: 'info', roles: ['ADMIN', 'SALES MANAGER'] },
  { id: 'd5', title: 'Your booking was approved', body: 'Plot A-012 was confirmed by the admin.', category: 'APPROVAL', severity: 'info', roles: ['SALES AGENT'] },
  { id: 'd6', title: 'Instalment due', body: 'Your next instalment for Plot A-101 is due soon.', category: 'PAYMENT_OVERDUE', severity: 'warning', roles: ['CUSTOMER'] },
  { id: 'd7', title: 'Collections summary ready', body: 'This week’s collection report is ready to review.', category: 'FOLLOW_UP', severity: 'info', roles: ['MANAGEMENT'] },
];

const dot = (severity) => (severity === 'alert' || severity === 'critical' || severity === 'error' ? 'red'
  : severity === 'warning' || severity === 'warn' ? 'amber' : 'green');

const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export function Notifications({ items, live, role, fups = {}, FUP, onAction, notify, onNavigate, allowedPages = [] }) {
  const list = live ? items : DEMO.filter((n) => n.roles.includes(role)).map((n) => ({ ...n, actioned_at: fups[n.id] ? 'done' : null }));

  const act = (item) => {
    if (live) onAction(item);
    else FUP?.(item.id, true);
    const target = (TARGETS[item.category] || []).find((page) => allowedPages.includes(page));
    if (target && onNavigate) onNavigate(target);
    else notify('Action logged — your role has no page for this task');
  };

  return (
    <>
      <RoleContextBanner role={role} page="Notifications" />

      <div className="panel section-panel">
        <div className="panel-head">
          <div>
            <h2>Alerts, Follow-ups &amp; Reminders</h2>
            <p>Only items addressed to you{role ? ` (${role.toLowerCase()})` : ''} appear here</p>
          </div>
        </div>

        <div className="notifications-list">
          {list.length === 0 && <p className="empty-note">You&apos;re all caught up — nothing needs your attention.</p>}
          {list.map((item) => (
            <div className="notification-row" key={item.id}>
              <span className={`status-dot ${dot(item.severity)}`} />
              <div className="notification-info">
                <b>{item.title}</b>
                <p>{item.body}</p>
                <small>{when(item.created_at)}</small>
              </div>
              <button className="button button-white small-button" onClick={() => act(item)}>
                {item.actioned_at ? 'Followed up ✓ · Open again' : 'Take Action'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
