import React from 'react';
import { Menu, Search, Shield } from 'lucide-react';

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
        <span className="crumb-org">{tenantName || 'Workspace'}</span> <span className="crumb-sep">/</span> <b>{page}</b>
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

        <div className="top-divider" />

        <div className="top-user">
          <div className="avatar avatar-indigo">
            {(user?.name || 'NA').split(' ').slice(0, 2).map((x) => x[0]).join('').toUpperCase()}
          </div>
          <span>{user?.name || 'Workspace User'}</span>
        </div>
      </div>
    </header>
  );
}
