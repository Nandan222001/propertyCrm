import React, { useMemo } from 'react';
import { UserRound } from 'lucide-react';
import { pct } from '../commissions/CommissionTeam';

/**
 * The sales-agent hierarchy as a tree: each agent sits under the agent who onboarded them, with what they hold
 * of the commission pool and what they keep on their own branch's deals.
 *
 * `rows` are the API's agent rows (`id`, `name`, `code`, `commission_rate`, `assigned_rate`, `parent_agent_id`,
 * `is_active`). Agents whose parent is not in `rows` (another admin's branch) are shown as roots.
 */
export function AgentTree({ rows = [], meId = null, onView }) {
  const tree = useMemo(() => {
    const known = new Set(rows.map((r) => r.id));
    const children = new Map();
    rows.forEach((row) => {
      const parent = row.parent_agent_id && known.has(row.parent_agent_id) ? row.parent_agent_id : 'root';
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(row);
    });
    children.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return children;
  }, [rows]);

  if (!rows.length) return <p className="empty-note">No agents yet — add an agent and hand them a slice of your commission.</p>;

  const branch = (parent, level) => (tree.get(parent) || []).map((row) => {
    const kids = tree.get(row.id) || [];
    const held = Number(row.commission_rate) || 0;
    return (
      <li key={row.id}>
        <div className={`agent-node${row.is_active === 'INACTIVE' ? ' inactive' : ''}${row.id === meId ? ' me' : ''}`}>
          <span className="agent-node-name">
            {row.name}
            {row.id === meId ? <em> (you)</em> : null}
            {row.is_active === 'INACTIVE' ? <em> (inactive)</em> : null}
          </span>
          <span className="agent-node-code">{row.code}</span>
          <span className="agent-node-rate" title="Share of the commission pool this agent holds">
            holds {pct(held)}
          </span>
          {row.assigned_rate != null && Number(row.assigned_rate) > 0 ? (
            <span className="agent-node-meta">given {pct(row.assigned_rate)}</span>
          ) : null}
          {row.deals != null ? <span className="agent-node-meta">{row.deals} deal{row.deals === 1 ? '' : 's'}</span> : null}
          <span className="agent-node-meta">{kids.length} below</span>
          {onView ? (
            <button className="icon-action" title="View agent profile" onClick={() => onView(row)}>View</button>
          ) : null}
        </div>
        {kids.length ? <ul>{branch(row.id, level + 1)}</ul> : null}
      </li>
    );
  });

  return (
    <div className="agent-tree" role="tree" aria-label="Sales agent hierarchy">
      <ul>{branch('root', 0)}</ul>
    </div>
  );
}

/**
 * The same hierarchy drawn as an org chart: the root on top, its agents in a row beneath it joined by dotted
 * lines, and theirs beneath them. `rows[0]` is the root; every other row's `parent_agent_id` points inside `rows`.
 */
export function AgentOrgChart({ rows = [], meId = null }) {
  const root = rows[0];
  const kids = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      if (!map.has(row.parent_agent_id)) map.set(row.parent_agent_id, []);
      map.get(row.parent_agent_id).push(row);
    });
    map.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return map;
  }, [rows]);
  if (!root) return null;

  const seen = new Set();
  const node = (row) => {
    seen.add(row.id);
    const below = (kids.get(row.id) || []).filter((child) => !seen.has(child.id));
    const tip = `${row.name} (${row.code}) · holds ${pct(row.commission_rate)}${row.assigned_rate != null ? ` · given ${pct(row.assigned_rate)}` : ''} · ${row.deals ?? 0} deals`;
    return (
      <li key={row.id}>
        <div className={`org-node${row.id === meId ? ' me' : ''}${row.is_active === 'INACTIVE' ? ' inactive' : ''}`} title={tip}>
          <span className="org-avatar"><UserRound size={20} strokeWidth={2.4} /></span>
          <span className="org-name">({row.code}) {row.name}{row.id === meId ? ' · you' : ''}</span>
          <span className="org-meta">{pct(row.commission_rate)}{row.deals ? ` · ${row.deals} deal${row.deals === 1 ? '' : 's'}` : ''}</span>
        </div>
        {below.length > 0 && <ul>{below.map(node)}</ul>}
      </li>
    );
  };
  return (
    <div className="org-chart" role="tree" aria-label={`Downline tree of ${root.name}`}>
      <ul>{node(root)}</ul>
    </div>
  );
}
