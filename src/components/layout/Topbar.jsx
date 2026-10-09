import React from 'react';
import { Bell, LogOut, Menu, Search, Shield } from 'lucide-react';

/** Top app bar: breadcrumb, global search, role pill and identity. */
export function Topbar({
  page, role, roleConfig, session, tenantName, search, user, unread = null, onMenu, onSearch, onNavigate, onLogout,
}) {
  return (
    <header className="topbar">
      <button className="menu-toggle" onClick={onMenu} aria-label="Open navigation">
        <Menu size={19} />
      </button>

      <div className="breadcrumb">
        {tenantName || 'Workspace'} <span>/</span> <b>{page}</b>
      </div>

      <div className="top-actions">
        <div className="topbar-role-pill" style={{ background: roleConfig.bg, color: roleConfig.color }}>
          <Shield size={12} />
          <span>{role}</span>
        </div>

        <div className="global-search">
          <Search size={14} />
          <input
            placeholder="Search plots, clients, deals..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Global search"
          />
          <kbd>⌘K</kbd>
        </div>

        <button className="top-icon" onClick={() => onNavigate('Notifications')} title="View alerts">
          <Bell size={17} />
          {(unread === null || unread > 0) && <em />}
        </button>

        <div className="top-divider" />

        <div className="top-user" onClick={onLogout} title="Click to log out">
          <div className="avatar avatar-indigo">
            {(user?.name || 'NA').split(' ').slice(0, 2).map((x) => x[0]).join('').toUpperCase()}
          </div>
          <span>{user?.name || 'Workspace User'}</span>
          <LogOut size={13} className="logout-inline-icon" />
        </div>
      </div>
    </header>
  );
}
