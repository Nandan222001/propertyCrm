import React, { useState } from 'react';
import { ModalShell } from '../../components/common/ModalShell';
import { parseAmt, fmtINR } from '../../utils';

const FACINGS = ['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West'];

/** Edit a plot's details. Its status is never typed in: bookings and approvals move it. */
export function EditPlotModal({ plot, close, save }) {
  const [form, setForm] = useState({
    layout: plot[1] || '', area: String(parseAmt(plot[2]) || ''), facing: plot[3] || '', price: String(parseAmt(plot[4]) || ''),
    corner: Boolean(plot[12]), commercial: Boolean(plot[13]), park: Boolean(plot[14]),
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const area = Number(form.area);
    const price = Number(form.price);
    if (!form.layout.trim()) return setError('Enter the layout name.');
    if (!(area > 0)) return setError('Area must be more than zero.');
    if (!(price > 0)) return setError('Price must be more than zero.');
    const changes = {};
    if (form.layout.trim() !== plot[1]) changes.layout = form.layout.trim();
    if (area !== parseAmt(plot[2])) changes.area_sqft = area;
    if (form.facing && form.facing !== plot[3]) changes.facing = form.facing;
    if (price !== parseAmt(plot[4])) changes.price = price;
    if (form.corner !== Boolean(plot[12])) changes.is_corner = form.corner;
    if (form.commercial !== Boolean(plot[13])) changes.is_commercial = form.commercial;
    if (form.park !== Boolean(plot[14])) changes.is_park_facing = form.park;
    if (!Object.keys(changes).length) return close();
    setBusy(true);
    const problem = await save(plot, changes);
    setBusy(false);
    if (problem) setError(problem); else close();
  };

  return (
    <ModalShell title={`Edit plot ${plot[0]}`} subtitle={`${plot[8]} · currently ${String(plot[5]).toLowerCase()}`} onClose={close}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <label>Layout<input value={form.layout} onChange={set('layout')} autoFocus /></label>
          <label>Area (sq.ft)<input value={form.area} onChange={set('area')} inputMode="decimal" /></label>
          <label>Facing
            <select value={form.facing} onChange={set('facing')}>
              {!FACINGS.includes(form.facing) && <option value={form.facing}>{form.facing || 'Select'}</option>}
              {FACINGS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label>Price (₹)<input value={form.price} onChange={set('price')} inputMode="numeric" /></label>
        </div>
        <fieldset className="plot-features">
          <legend>Features that carry a premium</legend>
          <label><input type="checkbox" checked={form.corner} onChange={(e) => setForm({ ...form, corner: e.target.checked })} /> Corner plot</label>
          <label><input type="checkbox" checked={form.commercial} onChange={(e) => setForm({ ...form, commercial: e.target.checked })} /> Commercial plot</label>
          <label><input type="checkbox" checked={form.park} onChange={(e) => setForm({ ...form, park: e.target.checked })} /> Park / plantation facing</label>
          <small className="field-hint">The premium amounts are set on the project. Facing north-east or east adds its premium automatically.{plot[11] > 0 ? ` Current premium on this plot: ₹${fmtINR(plot[11])}.` : ''}</small>
        </fieldset>
        {plot[5] !== 'AVAILABLE' && <p className="field-hint">This plot is {String(plot[5]).toLowerCase()}; the booking keeps the price it was agreed at.</p>}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </ModalShell>
  );
}
