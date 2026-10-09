import React from 'react';
import { Building2, Pause, Plus, Users } from 'lucide-react';
import { Badge } from '../../components/common/Badge';
import { Mini } from '../../components/common/StatTile';
import { PLAN_LABEL, platformStats, seatUsage } from '../../utils/tenants';

/** Home screen of the platform owner: tenant health at a glance. No tenant business data. */
export function PlatformDashboard({ tenants = [], go, userName }) {
  const stats = platformStats(tenants);
  const recent = [...tenants].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5);
  const attention = tenants.filter((t) => t.status === 'SUSPENDED' || seatUsage(t).pct >= 90);
  const maxPlan = Math.max(1, ...stats.plans.map((p) => p.count));

  return (
    <div className="role-dashboard">
      <div className="mini-stats four">
        <Mini title="ORGANISATIONS" value={stats.total} />
        <Mini title="ACTIVE" value={stats.active} color="green-text" />
        <Mini title="SUSPENDED" value={stats.suspended} color="amber-text" />
        <Mini title="USERS ACROSS TENANTS" value={`${stats.users} / ${stats.seats} seats`} color="indigo-text" />
      </div>

      <article className="panel">
        <div className="panel-head">
          <div>
            <h2>Welcome{userName ? `, ${userName.split(' ')[0]}` : ''}</h2>
            <p>You manage organisations and their access. Each organisation’s customers, bookings and payments stay private to it.</p>
          </div>
          <button className="button button-primary small-btn" onClick={() => go('Tenants')}><Plus size={12} /> Add Tenant</button>
        </div>

        <div className="agent-tiles">
          {stats.plans.map(({ plan, count }) => (
            <div key={plan}>
              <small>{PLAN_LABEL[plan]} plan</small>
              <b>{count}</b>
              <span className="progress-track" style={{ display: 'block' }}>
                <span style={{ width: `${(count / maxPlan) * 100}%` }} />
              </span>
            </div>
          ))}
        </div>
      </article>

      <article className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head">
          <div><h2>Needs attention</h2><p>Suspended organisations and tenants using 90%+ of their seats.</p></div>
        </div>
        {attention.length === 0 && <p className="empty-note">Everything looks healthy.</p>}
        <div className="documents-list">
          {attention.map((t) => (
            <div className="document-row" key={t.id}>
              {t.status === 'SUSPENDED' ? <Pause size={18} className="indigo-text" /> : <Users size={18} className="indigo-text" />}
              <div>
                <b>{t.name}</b>
                <small>{t.status === 'SUSPENDED' ? `Suspended: ${t.suspended_reason || 'no reason recorded'}` : `${seatUsage(t).used} of ${t.max_users} seats used`}</small>
              </div>
              <Badge>{t.status === 'SUSPENDED' ? 'Suspended' : 'Seats nearly full'}</Badge>
              <button className="button button-white small-btn" onClick={() => go('Tenants')}>Open</button>
            </div>
          ))}
        </div>
      </article>

      <article className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head">
          <div><h2>Recently added</h2></div>
          <button className="text-button" onClick={() => go('Tenants')}>View all →</button>
        </div>
        <div className="documents-list">
          {recent.map((t) => (
            <div className="document-row" key={t.id}>
              <Building2 size={18} className="indigo-text" />
              <div><b>{t.name}</b><small>/{t.slug} · {PLAN_LABEL[t.plan] || t.plan}</small></div>
              <span className="doc-date">{t.usage?.users ?? 0} users</span>
              <Badge>{t.status === 'ACTIVE' ? 'Active' : 'Suspended'}</Badge>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
