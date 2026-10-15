import React, { useState } from 'react';
import { ChevronDown, KeyRound, LayoutDashboard, LogOut, X } from 'lucide-react';
import { PAGE_ICON } from '../../constants/navigation';

/** Left navigation rail: brand, workspace chip, role-aware nav, identity footer. */
export function Sidebar({
  role, roleConfig, user, nav, badgeFor, page, mobileOpen, projects, project, tenantName, showWorkspace = true,
  session, onNavigate, onClose, onProjectChange, onLogout, onChangePassword,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [brandFirst, ...brandWords] = (tenantName || '').split(' ');
  const brandRest = brandWords.join(' ');
  const pick = (value) => { onProjectChange(value); setPickerOpen(false); };
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
        <div className="brand-mark">{(tenantName || 'L').trim().charAt(0).toUpperCase()}</div>
        <div>
          <b>{brandFirst} <span>{brandRest}</span></b>
          <small>ENTERPRISE REAL ESTATE</small>
        </div>
        <button className="sidebar-close" onClick={onClose} aria-label="Close navigation">
          <X size={18} />
        </button>
      </div>

      <div className="workspace-card">
        <div className="sidebar-role-tag" style={{ borderLeftColor: roleConfig.color }}>
          <span className="role-dot" style={{ background: roleConfig.color }} />
          <div className="role-tag-info">
            <b>{role}</b>
            <small>{roleConfig.badge}</small>
          </div>
        </div>

        {showWorkspace && projects.length > 0 && (
        <div className="workspace-picker">
        <button
          className="workspace"
          onClick={() => setPickerOpen((open) => !open)}
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
          title="Choose project"
        >
          <span className="workspace-icon">{(project === 'All projects' ? 'All' : project).slice(0, 2).toUpperCase()}</span>
          <span>
            <b>{project === 'All projects' ? 'All projects' : project}</b>
            <small>{project === 'All projects'
              ? `${projects.length} project${projects.length === 1 ? '' : 's'}`
              : (projects.find((p) => p[0] === project)?.[1] || '—')}</small>
          </span>
          <ChevronDown size={14} />
        </button>
        {pickerOpen && (
          <div className="workspace-menu" role="listbox">
            <button role="option" aria-selected={project === 'All projects'} onClick={() => pick('All projects')}>All projects</button>
            {projects.map((p) => (
              <button key={p[0]} role="option" aria-selected={project === p[0]} onClick={() => pick(p[0])}>
                {p[0]}<small>{p[1]}</small>
              </button>
            ))}
            <button className="workspace-menu-manage" onClick={() => { setPickerOpen(false); onNavigate('Projects & plots'); }}>
              Manage projects →
            </button>
          </div>
        )}
        </div>
        )}
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

          {onChangePassword && (
            <button className="logout-button" onClick={onChangePassword} title="Change password" aria-label="Change password">
              <KeyRound size={14} />
            </button>
          )}
          <button className="logout-button" onClick={onLogout} title="Sign out of workspace">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
