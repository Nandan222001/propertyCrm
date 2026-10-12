import React, { useState } from 'react';
import { ModalShell } from '../../components/common/ModalShell';
import { isValidMobile, normaliseMobile, MOBILE_HINT } from '../../utils/phone';

const hidden = (value) => String(value || '').includes('*');

/**
 * Edit a customer file. Values hidden for the viewer's role (masked with *) start blank and are
 * only sent when something is typed, so a masked placeholder can never overwrite the real record.
 */
export function EditCustomerModal({ customer, close, save }) {
  const start = (value) => (hidden(value) ? '' : value || '');
  const [form, setForm] = useState({
    name: start(customer.name), phone: start(customer.mobile), email: start(customer.email), address: start(customer.address),
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const changes = {};
    if (form.name.trim() && form.name.trim() !== start(customer.name)) changes.name = form.name.trim();
    if (form.phone && !isValidMobile(form.phone)) return setError(MOBILE_HINT);
    const phone = normaliseMobile(form.phone);
    if (phone && phone !== normaliseMobile(start(customer.mobile))) changes.phone = phone;
    if (form.email.trim() && form.email.trim() !== start(customer.email)) {
      if (!form.email.includes('@')) return setError('Enter a valid e-mail address.');
      changes.email = form.email.trim();
    }
    if (form.address.trim() && form.address.trim() !== start(customer.address)) changes.address = form.address.trim();
    if (!Object.keys(changes).length) return close();
    setBusy(true);
    const problem = await save(customer, changes);
    setBusy(false);
    if (problem) setError(problem); else close();
  };

  return (
    <ModalShell title="Edit customer" subtitle="Leave a hidden field empty to keep its current value." onClose={close}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <label>Full name<input value={form.name} onChange={set('name')} placeholder={hidden(customer.name) ? 'Hidden — type to change' : ''} autoFocus /></label>
          <label>Mobile<input value={form.phone} onChange={set('phone')} inputMode="numeric" placeholder={hidden(customer.mobile) ? 'Hidden — type to change' : ''} /></label>
          <label>E-mail<input value={form.email} onChange={set('email')} placeholder={hidden(customer.email) ? 'Hidden — type to change' : ''} /></label>
          <label>Address<input value={form.address} onChange={set('address')} placeholder={hidden(customer.address) ? 'Hidden — type to change' : ''} /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </ModalShell>
  );
}
