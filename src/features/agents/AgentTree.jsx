import React, { useMemo } from 'react';
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
