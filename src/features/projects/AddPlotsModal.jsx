import React, { useState } from 'react';
import { ModalShell } from '../../components/common/ModalShell';

const FACINGS = ['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West'];

/**
 * Add the actual plots to a project. A project's "total plots" is only a target number: bookings are made
 * against real plot records, so this creates them (a numbered run such as A-1 … A-20 sharing one size and price).
 */
export function AddPlotsModal({ projects, defaultProject = '', close, save }) {
  const real = projects.filter((p) => typeof p[6] === 'number');
  const [form, setForm] = useState({
    project: real.find((p) => p[0] === defaultProject)?.[0] || real[0]?.[0] || '',
    prefix: 'A-', start: '1', count: '', layout: '', facing: 'East', area: '', price: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const picked = real.find((p) => p[0] === form.project);
  const count = Number(form.count);
  const first = `${form.prefix.trim().toUpperCase()}${Number(form.start)}`;
  const last = `${form.prefix.trim().toUpperCase()}${Number(form.start) + Math.max(count - 1, 0)}`;

  const submit = async (e) => {
    e.preventDefault();
    if (!picked) return setError('Choose the project.');
    if (!Number.isInteger(count) || count < 1 || count > 500) return setError('How many plots: a whole number from 1 to 500.');
    if (!Number.isInteger(Number(form.start)) || Number(form.start) < 0) return setError('Starting number must be 0 or more.');
    if (!(Number(form.area) > 0)) return setError('Enter the plot area in sq.ft.');
    if (!(Number(String(form.price).replace(/,/g, '')) > 0)) return setError('Enter the price for each plot.');
    setBusy(true);
    const problem = await save({
      project_id: picked[6], prefix: form.prefix.trim(), start: Number(form.start), count,
      layout: form.layout.trim() || undefined, facing: form.facing || undefined,
      area_sqft: Number(form.area), price: Number(String(form.price).replace(/,/g, '')),
    }, count);
    setBusy(false);
    if (problem) setError(problem); else close();
  };

  return (
    <ModalShell title="Add plots" subtitle="Agents can only book plots that exist here. Plots added together share the same area and price; you can edit any plot afterwards." onClose={close}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <label className="span-2">Project
            <select value={form.project} onChange={set('project')}>
              {real.map((p) => <option key={p[0]}>{p[0]}</option>)}
            </select>
          </label>
          <label>Plot number prefix<input value={form.prefix} onChange={set('prefix')} maxLength={30} placeholder="e.g. A-" /></label>
          <label>Starting number<input value={form.start} onChange={set('start')} inputMode="numeric" /></label>
          <label>How many plots<input value={form.count} onChange={set('count')} inputMode="numeric" placeholder="e.g. 20" autoFocus /></label>
          <label>Layout<input value={form.layout} onChange={set('layout')} placeholder="Layout name" /></label>
          <label>Area of each (sq.ft)<input value={form.area} onChange={set('area')} inputMode="decimal" /></label>
          <label>Facing
            <select value={form.facing} onChange={set('facing')}>{FACINGS.map((f) => <option key={f}>{f}</option>)}</select>
          </label>
          <label className="span-2">Price of each (₹)<input value={form.price} onChange={set('price')} inputMode="numeric" /></label>
        </div>
        {count >= 1 && <p className="field-hint">This creates {count} plot{count === 1 ? '' : 's'}: {first}{count > 1 ? ` … ${last}` : ''}, all available for booking.</p>}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy || !real.length}>{busy ? 'Adding…' : 'Add plots'}</button>
        </div>
        {!real.length && <p className="form-error">Add a project first.</p>}
      </form>
    </ModalShell>
  );
}
