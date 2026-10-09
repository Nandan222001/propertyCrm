import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { projectFormValues, validateProject } from '../../utils/projects';

/** Add / edit a project. `editing` is the existing table row (null when adding). */
export function ProjectModal({ editing, projects, close, save }) {
  const [form, setForm] = useState(() => projectFormValues(editing));
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const problem = validateProject(form, { projects, editing });
    setError(problem);
    if (problem) return;
    save(form, editing);
    close();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className="modal" onSubmit={submit} noValidate>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">{editing ? `EDIT PROJECT · ${editing[0]}` : 'NEW PROJECT'}</span>
            <h2>{editing ? 'Edit project' : 'Add project'}</h2>
            <p>
              {editing
                ? 'Renaming a project also updates its plots, bookings, payments and invoices.'
                : 'Create a project, then add plots to it. Booked and hold counts update as plots are sold.'}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={17} /></button>
        </div>

        <div className="form-grid">
          <label className="span-2">
            Project name *
            <input value={form.name} onChange={set('name')} placeholder="e.g. Green Meadows" autoFocus />
          </label>
          <label>
            Phase
            <input value={form.phase} onChange={set('phase')} placeholder="e.g. Phase II" />
          </label>
          <label>
            City
            <input value={form.city} onChange={set('city')} placeholder="e.g. Mumbai" />
          </label>
          <label className="span-2">
            Location / address
            <input value={form.location} onChange={set('location')} placeholder="Survey no., village, taluka" />
          </label>
          <label>
            Total plots *
            <input type="number" min="0" step="1" value={form.total} onChange={set('total')} placeholder="128" />
          </label>
          <label>
            RERA number
            <input value={form.rera} onChange={set('rera')} placeholder="P5180000…" />
          </label>
          <label>
            Base rate (₹ / sq.ft)
            <input type="number" min="0" step="any" value={form.rate} onChange={set('rate')} placeholder="3500" />
          </label>
          <label>
            Estimated revenue (₹ crore)
            <input type="number" min="0" step="any" value={form.revenue} onChange={set('revenue')} placeholder="12.6" />
          </label>
          <label>
            Status
            <select value={form.active ? 'Active' : 'Inactive'} onChange={(e) => setForm({ ...form, active: e.target.value === 'Active' })}>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </label>
        </div>

        {error && <p className="form-error" role="alert" style={{ color: '#d92d20', margin: '8px 0 0' }}>{error}</p>}

        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary"><Check size={13} /> {editing ? 'Save changes' : 'Add project'}</button>
        </div>
      </form>
    </div>
  );
}
