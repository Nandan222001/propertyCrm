import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Network, Plus, X } from 'lucide-react';
import { fmtINR } from '../../utils';
import { actions } from '../../api';
import { Table } from '../../components/common/DataTable';
import { Mini } from '../../components/common/StatTile';
import { Badge } from '../../components/common/Badge';
import { pageCache } from '../../utils/pageCache';
import { AddTeamAgentModal, pct } from '../commissions/CommissionTeam';
import { AgentOrgChart } from './AgentTree';

const joined = (value) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-GB') : '—';
};

/** The downline of one member as a tree: the member at the top, everyone they brought in below, and theirs below them. */
function DownlineTreeModal({ root, members, meId, close }) {
  const rows = useMemo(() => {
    const kids = new Map();
    members.forEach((m) => {
      if (!kids.has(m.parent_agent_id)) kids.set(m.parent_agent_id, []);
      kids.get(m.parent_agent_id).push(m);
    });
    const out = [root];
    const seen = new Set([root.id]);
    const walk = (id) => (kids.get(id) || []).forEach((child) => {
      if (seen.has(child.id)) return;
      seen.add(child.id);
      out.push(child);
      walk(child.id);
    });
    walk(root.id);
    return out;
  }, [root, members]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal org-modal" role="dialog" aria-modal="true" aria-label={`Downline tree of ${root.name}`}>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">DOWNLINE TREE</span>
            <h2>{root.name}</h2>
            <p>{rows.length - 1 ? `${rows.length - 1} agent${rows.length - 1 === 1 ? '' : 's'} below ${root.name}` : `No agents below ${root.name} yet`} · holds {pct(root.commission_rate)}</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>
        <AgentOrgChart rows={rows} meId={meId} />
      </div>
    </div>
  );
}

/**
 * "My Team" (sales agent): the same hierarchy the commission rules use — me at the top, every agent I brought in
 * below me, and theirs below them — with each member's level, who they report to, what they hold, their deals
 * and sales, and how many agents sit below them.
 */
export function MyTeam({ search = '', notify }) {
  const [team, setTeam] = useState(() => pageCache.get('my-team') ?? null);
  const [adding, setAdding] = useState(false);
  const [treeOf, setTreeOf] = useState(null);   // the member whose downline tree is open

  const load = useCallback(async () => {
    try {
      const response = await actions.agentTeam();
      setTeam(pageCache.set('my-team', response.data));
    } catch (error) {
      notify(`Could not load your team: ${error.message}`);
      setTeam({ me: null, can_add: false, members: [] });
    }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  const members = team?.members || [];
  const me = team?.me || null;

  // How many agents sit anywhere below each member (children, their children, …).
  const downline = useMemo(() => {
    const kids = new Map();
    members.forEach((m) => {
      if (!kids.has(m.parent_agent_id)) kids.set(m.parent_agent_id, []);
      kids.get(m.parent_agent_id).push(m.id);
    });
    const count = (id, seen = new Set()) => (kids.get(id) || []).reduce((sum, child) => {
      if (seen.has(child)) return sum;
      seen.add(child);
      return sum + 1 + count(child, seen);
    }, 0);
    return new Map(members.map((m) => [m.id, count(m.id, new Set([m.id]))]));
  }, [members]);

  if (!team) return <p className="empty-note panel">Loading your team…</p>;

  const below = members.filter((m) => !me || m.id !== me.id);
  const direct = below.filter((m) => me && m.parent_agent_id === me.id).length;
  const teamDeals = members.reduce((s, m) => s + Number(m.deals || 0), 0);
  const teamSales = members.reduce((s, m) => s + Number(m.sales_value || 0), 0);
  const needle = String(search || '').trim().toLowerCase();
  const shown = needle
    ? members.filter((m) => [m.name, m.code, m.parent_name, m.email, m.phone].join(' ').toLowerCase().includes(needle))
    : members;

  const add = async (body, share) => {
    try {
      await actions.addSubAgent(body);
      notify(`${body.name} added to your team with ${Number(share.toFixed(2))}%. They can sign in with their e-mail and a starting password.`);
      pageCache.set('commission-team', null);
      await load();
      return '';
    } catch (error) {
      return error.message || 'Could not add the agent.';
    }
  };

  return (
    <>
      <div className="mini-stats five">
        <Mini title="TEAM MEMBERS" value={below.length} />
        <Mini title="DIRECT AGENTS" value={direct} />
        <Mini title="TEAM DEALS" value={teamDeals} />
        <Mini title="TEAM SALES" value={`₹${fmtINR(teamSales)}`} />
        <Mini title="MY RATE" value={me ? pct(me.commission_rate) : '—'} />
      </div>

      <div className="panel section-panel">
        <div className="crud-heading">
          <div>
            <h2>My team</h2>
            <p>
              {me
                ? `You hold ${pct(me.commission_rate)} of the commission pool. Everyone below you takes a slice of it, and a deal only pays the agent who brought it and the agents above them.`
                : 'Your agent profile is not linked yet, so there is no team to show.'}
            </p>
          </div>
          {team.can_add && me && (
            <button className="button button-primary small-btn" onClick={() => setAdding(true)}><Plus size={13} /> Add agent</button>
          )}
        </div>
        <Table
          label="my team"
          headers={['SR', 'AGENT', 'CODE', 'LEVEL', 'REPORTS TO', 'JOINED', 'STATUS', 'RATE HELD', 'GIVEN BY PARENT', 'DEALS', 'SALES', 'COMMISSION EARNED', 'DOWNLINE', 'TREE']}
          empty={needle ? 'No team member matches your search.' : 'No agents under you yet — add one and hand them part of your commission'}
          rows={shown.map((m, i) => [
            i + 1,
            <b style={{ paddingLeft: m.level * 16 }}>{m.level > 0 ? '↳ ' : ''}{m.name}{me && m.id === me.id ? ' (you)' : ''}</b>,
            m.code,
            me && m.id === me.id ? 'Self' : m.level,
            m.parent_name || '—',
            joined(m.created_at),
            <Badge>{m.is_active === 'INACTIVE' ? 'Inactive' : 'Active'}</Badge>,
            <b className="green-text">{pct(m.commission_rate)}</b>,
            m.assigned_rate != null ? pct(m.assigned_rate) : '—',
            m.deals ?? 0,
            `₹${fmtINR(Number(m.sales_value || 0))}`,
            `₹${fmtINR(Number(m.commission_earned || 0))}`,
            downline.get(m.id) || 0,
            <button className="icon-action" title={`Downline tree of ${m.name}`} aria-label={`Downline tree of ${m.name}`} onClick={() => setTreeOf(m)}>
              <Network size={15} />
            </button>,
          ])}
        />
      </div>
      {treeOf && <DownlineTreeModal root={treeOf} members={members} meId={me?.id ?? null} close={() => setTreeOf(null)} />}
      {adding && <AddTeamAgentModal parent={me} parents={null} close={() => setAdding(false)} save={add} />}
    </>
  );
}
