import React from 'react';
import { ChevronDown, LayoutDashboard, LogOut, X } from 'lucide-react';
import { PAGE_ICON } from '../../constants/navigation';
import { PREVIEW_ROLES, ROLE_ORDER } from '../../constants/roles';

/** Left navigation rail: brand, workspace chip, role-aware nav, identity footer. */
export function Sidebar({
  role, roleConfig, user, nav, badgeFor, page, mobileOpen, projects, project,
  session, onNavigate, onClose, onProjectChange, onRolePreview, onLogout,
}) {
  const renderItems = (items) => items.map((name) => {
    const Icon = PAGE_ICON[name] || LayoutDashboard;
    const badge = badgeFor(name);
    return (
      <button className={`nav-item ${page === name ? 'active' : ''}`} key={name} onClick={() => onNavigate(name)}>
        <Icon size={16} />
        <span>{name}</span>
        {badge && <i className={badge.alert ? 'alert-count' : ''}>{badge.text}</i>}
      </button>
    );
  });

  return (
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      <div className="brand">
        <div className="brand-mark">L</div>
        <div>
          <b>Lalita <span>Realestate Infra</span></b>
          <small>ENTERPRISE REAL ESTATE</small>
        </div>
        <button className="sidebar-close" onClick={onClose} aria-label="Close navigation">
          <X size={18} />
        </button>
      </div>

      <div className="workspace-card">
        <button
          className="workspace"
          onClick={() => onProjectChange(project === 'All projects' ? (projects[0]?.[0] || 'Green Meadows') : 'All projects')}
          title="Switch project filter"
        >
          <span className="workspace-icon">GM</span>
          <span>
            <b>{project === 'All projects' ? (projects[0]?.[0] || 'Green Meadows') : project}</b>
            <small>Phase II · Mumbai</small>
          </span>
          <ChevronDown size={14} />
        </button>

        <div className="sidebar-role-tag" style={{ borderLeftColor: roleConfig.color }}>
          <span className="role-dot" style={{ background: roleConfig.color }} />
          <div className="role-tag-info">
            <b>{role}</b>
            <small>{roleConfig.badge}</small>
          </div>
        </div>
      </div>

      <div className="nav-label">WORKSPACE</div>
      <nav>{renderItems(nav.workspace)}</nav>

      {nav.insights.length > 0 && (
        <>
          <div className="nav-label nav-gap">INSIGHTS &amp; GOVERNANCE</div>
          <nav>{renderItems(nav.insights)}</nav>
        </>
      )}

      <div className="sidebar-bottom">
        <div className="user-profile">
          <div className="avatar avatar-indigo">
            {(user?.name || 'NA').split(' ').slice(0, 2).map((x) => x[0]).join('').toUpperCase()}
          </div>
          <div className="user-info">
            <b>{user?.name || 'Workspace User'}</b>
            <small>{role}</small>
          </div>

          {PREVIEW_ROLES.includes(session) && (
            <select value={role} onChange={(e) => onRolePreview(e.target.value)} title="Preview another role">
              {ROLE_ORDER.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}

          <button className="logout-button" onClick={onLogout} title="Sign out of workspace">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
