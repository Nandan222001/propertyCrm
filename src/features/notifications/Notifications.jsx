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

const dot = (severity) => (severity === 'alert' || severity === 'critical' || severity === 'error' ? 'red'
  : severity === 'warning' || severity === 'warn' ? 'amber' : 'green');

const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export function Notifications({ items, live, role, fups = {}, FUP, onAction, notify, onNavigate, allowedPages = [] }) {
  const list = live ? items : [];

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
