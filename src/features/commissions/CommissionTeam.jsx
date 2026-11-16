import React, { useCallback, useEffect, useState } from 'react';
import { Check, Plus, UsersRound, X } from 'lucide-react';
import { fmtINR, isValidMobile, normaliseMobile, MOBILE_HINT } from '../../utils';
import { isAdmin } from '../../utils/permissions';
import { actions } from '../../api';
import { Table } from '../../components/common/DataTable';
import { limitMobile, MOBILE_INPUT } from '../../utils/phone';
import { pageCache } from '../../utils/pageCache';

/** Every agent keeps at least this much (%) of their own rate — the chain stops here. */
const MIN_KEPT = 1;

/** A rate as the server stores it (0.1) -> "10%". */
export const pct = (rate) => `${Number((Number(rate) * 100).toFixed(2))}%`;

/**
 * Hand part of your own commission to a new agent. The share comes out of your rate, so 20% with 10% handed
 * down leaves you on 10% and the new agent on 10%.
 */
function AddTeamAgentModal({ parent, parents, close, save }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', share: '', parent: parents ? '' : String(parent.id) });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, fn = (v) => v) => (e) => setForm({ ...form, [key]: fn(e.target.value) });
  const giver = parents ? parents.find((p) => String(p.id) === form.parent) : parent;
  const have = giver ? Number(giver.commission_rate) * 100 : 0;
  const share = Number(form.share);
  const submit = async (e) => {
    e.preventDefault();
    if (!giver) return setError('Choose the agent this new agent reports to.');
    if (form.name.replace(/[^A-Za-z]/g, '').length < 4) return setError('Enter a name with at least 4 letters.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return setError('Enter the agent\'s e-mail — it is their sign-in.');
    if (!isValidMobile(form.phone)) return setError(MOBILE_HINT);
    if (!Number.isFinite(share) || share <= 0) return setError('Enter the percentage you are giving this agent.');
    if (have - share < MIN_KEPT) return setError(have - MIN_KEPT > 0 ? `${giver.name} has ${pct(giver.commission_rate)} and must keep at least ${MIN_KEPT}%, so can give at most ${Number((have - MIN_KEPT).toFixed(2))}%.` : `${giver.name} is down to ${pct(giver.commission_rate)} — there is nothing left to give.`);
    setBusy(true);
    const problem = await save({
      name: form.name.trim(), email: form.email.trim(), phone: normaliseMobile(form.phone),
      share: String(Number((share / 100).toFixed(4))), ...(parents ? { parent_agent_id: giver.id } : {}),
    }, share);
    setBusy(false);
    if (problem) setError(problem); else close();
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className="modal view-modal" onSubmit={submit} noValidate>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">ADD AGENT TO TEAM</span>
            <h2>New agent under {giver ? giver.name : '…'}</h2>
            <p>The percentage you give comes out of {giver ? `${giver.name}'s` : 'the parent\'s'} own rate{giver ? ` (${pct(giver.commission_rate)} now)` : ''}. The new agent sees it as their own commission.</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="form-grid">
          {parents && (
            <label>Reports to
              <select value={form.parent} onChange={set('parent')}>
                <option value="">Choose agent…</option>
                {parents.map((p) => <option key={p.id} value={p.id}>{p.name} ({pct(p.commission_rate)})</option>)}
              </select>
            </label>
          )}
          <label>Full name<input value={form.name} onChange={set('name')} autoFocus placeholder="Full name" /></label>
          <label>Mobile<input value={form.phone} onChange={set('phone', limitMobile)} {...MOBILE_INPUT} placeholder="10-digit mobile number" /></label>
          <label>Email<input value={form.email} onChange={set('email')} type="email" placeholder="E-mail address" /></label>
          <label>Commission given (%)<input value={form.share} onChange={set('share')} inputMode="decimal" placeholder="e.g. 10" /></label>
        </div>
        {giver && Number.isFinite(share) && share > 0 && have - share >= MIN_KEPT && (
          <p className="bill-words">
            {giver.name}: {pct(giver.commission_rate)} → <b>{Number((have - share).toFixed(2))}%</b> · New agent: <b>{Number(share.toFixed(2))}%</b>
          </p>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}><Check size={13} /> Add agent</button>
        </div>
      </form>
    </div>
  );
}

/** "My commission team": my current rate, who I report to, and the agents below me with what each keeps. */
export function CommissionTeam({ role, notify, onChanged }) {
  const [team, setTeam] = useState(() => pageCache.get('commission-team') ?? null);
  const [adding, setAdding] = useState(false);
  const admin = isAdmin(role);

  const load = useCallback(async () => {
    try {
      const response = await actions.agentTeam();
      setTeam(pageCache.set('commission-team', response.data));
    } catch (error) {
      notify(`Could not load your team: ${error.message}`);
      setTeam({ me: null, can_add: false, members: [] });
    }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  if (!team || (!team.me && !admin)) return null;
  const me = team.me;
  const parentName = me && me.parent_agent_id ? (team.members.find((m) => m.id === me.parent_agent_id)?.name || 'your upline agent') : null;
  const members = team.members;

  const add = async (body, share) => {
    try {
      const response = await actions.addSubAgent(body);
      const parent = members.find((m) => m.id === response.data.parent_agent_id) || me;
      notify(`${body.name} added with ${Number(share.toFixed(2))}% — ${parent ? `${parent.name} now keeps ${pct(response.data.parent_commission_rate)}` : ''}. They can sign in with their e-mail and a starting password.`);
      await load();
      if (onChanged) onChanged();
      return '';
    } catch (error) {
      return error.message || 'Could not add the agent.';
    }
  };

  return (
    <div className="panel section-panel">
      <div className="crud-heading">
        <div>
          <h2><UsersRound size={14} style={{ verticalAlign: '-2px' }} /> {admin ? 'Agent hierarchy' : 'My commission team'}</h2>
          <p>
            {me
              ? `You currently earn ${pct(me.commission_rate)} on your own deals${parentName ? ` (given to you by ${parentName})` : ''}. Add agents under you and give each a share of that — it comes out of your own rate.`
              : 'Every agent, who they report to and the share of commission they keep.'}
          </p>
        </div>
        {team.can_add && (
          <button className="button button-primary small-btn" onClick={() => setAdding(true)}><Plus size={13} /> Add agent</button>
        )}
      </div>
      <Table
        label="commission team"
        headers={['AGENT', 'CODE', 'REPORTS TO', 'GIVEN BY PARENT', 'RATE KEPT', 'COMMISSION EARNED']}
        empty="No agents under you yet — add one and hand them part of your commission"
        rows={members.map((m) => [
          <b style={{ paddingLeft: m.level * 16 }}>{m.level > 0 ? '↳ ' : ''}{m.name}{me && m.id === me.id ? ' (you)' : ''}</b>,
          m.code,
          m.parent_name || '—',
          m.assigned_rate != null ? pct(m.assigned_rate) : '—',
          <b className="green-text">{pct(m.commission_rate)}</b>,
          `₹${fmtINR(Number(m.commission_earned))}`,
        ])}
      />
      {adding && (
        <AddTeamAgentModal
          parent={me}
          parents={admin && !me ? members.filter((m) => m.is_active !== 'INACTIVE') : null}
          close={() => setAdding(false)}
          save={add}
        />
      )}
    </div>
  );
}
