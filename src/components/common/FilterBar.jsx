import React from 'react';
import { Search } from 'lucide-react';

/**
 * Shared filter strip (project / period / free-text search / live-data meta).
 * Every list page renders this component instead of its own copy.
 */
export function FilterBar({
  project, projects = [], period, periodOptions = [], search, role,
  onProject, onPeriod, onSearch, placeholder, hidden = false,
}) {
  if (hidden) return null;
  return (
    <div className="filters">
      <label>
        <span>PROJECT</span>
        <select value={project} onChange={(e) => onProject(e.target.value)}>
          <option>All projects</option>
          {projects.map((p) => <option key={Array.isArray(p) ? p[0] : p}>{Array.isArray(p) ? p[0] : p}</option>)}
        </select>
      </label>

      <label>
        <span>PERIOD</span>
        <select value={period} onChange={(e) => onPeriod(e.target.value)}>
          {(periodOptions.length ? periodOptions : ['This month', 'Last month', 'This quarter', 'This year'])
            .map((option) => <option key={option}>{option}</option>)}
        </select>
      </label>

      <label className="search-filter">
        <Search size={14} />
        <input
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Search records"
        />
      </label>

      <div className="filter-meta">
        <i className="live-dot" /> Live Data
        <span className="meta-divider" />
        Role: <b>{role}</b>
      </div>
    </div>
  );
}
