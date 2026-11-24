import React from 'react';

/**
 * The personal + nominee details of the application form, shared by "Add customer" and "Edit customer".
 *
 * The form keeps one flat object (`emptyDetails()`); `detailsToApi` turns it into what the server stores:
 * the customer's own `address` / `city` / `pincode` plus the encrypted `profile` (the rest of the form).
 */

export const emptyDetails = () => ({
  dob: '', occupation: '', guardian: '',
  address: '', address2: '', city: '', state: '', pincode: '',
  permAddress: '', permAddress2: '', permCity: '', permState: '', permPincode: '',
  nomName: '', nomRelation: '', nomDob: '', nomPhone: '', nomEmail: '',
  nomAddress: '', nomCity: '', nomState: '', nomPincode: '',
});

/** Server customer (as adapted for the SPA) -> form values. */
export function detailsFromCustomer(customer = {}) {
  const profile = customer.profile || {};
  const perm = profile.permanent || {};
  const nom = profile.nominee || {};
  const masked = (value) => String(value || '').includes('*');
  return {
    dob: profile.dob || '', occupation: profile.occupation || '',
    guardian: profile.guardian_name || '',
    address: masked(customer.address) ? '' : (customer.addressLine ?? customer.address ?? ''),
    address2: profile.address2 || '', city: customer.city || '', state: profile.state || '', pincode: customer.pincode || '',
    permAddress: perm.address || '', permAddress2: perm.address2 || '', permCity: perm.city || '',
    permState: perm.state || '', permPincode: perm.pincode || '',
    nomName: nom.name || '', nomRelation: nom.relationship || '', nomDob: nom.dob || '', nomPhone: nom.phone || '',
    nomEmail: nom.email || '', nomAddress: nom.address || '', nomCity: nom.city || '', nomState: nom.state || '',
    nomPincode: nom.pincode || '',
  };
}

const text = (value) => String(value ?? '').trim();

/** Form values -> `{ address, city, pincode, profile }` for the API (blank values are left out by the server). */
export function detailsToApi(d) {
  return {
    address: text(d.address), city: text(d.city), pincode: text(d.pincode),
    profile: {
      dob: text(d.dob), occupation: text(d.occupation), guardian_name: text(d.guardian),
      address2: text(d.address2), state: text(d.state),
      permanent: {
        address: text(d.permAddress), address2: text(d.permAddress2), city: text(d.permCity),
        state: text(d.permState), pincode: text(d.permPincode),
      },
      nominee: {
        name: text(d.nomName), relationship: text(d.nomRelation), dob: text(d.nomDob), phone: text(d.nomPhone),
        email: text(d.nomEmail), address: text(d.nomAddress), city: text(d.nomCity), state: text(d.nomState),
        pincode: text(d.nomPincode),
      },
    },
  };
}

/** A message when something typed is clearly wrong, otherwise ''. */
export function validateDetails(d) {
  const pin = /^[1-9]\d{5}$/;
  const today = new Date().toISOString().slice(0, 10);
  if (text(d.dob) && text(d.dob) > today) return 'Date of birth cannot be in the future.';
  if (text(d.nomDob) && text(d.nomDob) > today) return 'Nominee date of birth cannot be in the future.';
  for (const [value, label] of [[d.pincode, 'Pin code'], [d.permPincode, 'Permanent address pin code'], [d.nomPincode, 'Nominee pin code']]) {
    if (text(value) && !pin.test(text(value))) return `${label} must be 6 digits.`;
  }
  if (text(d.nomEmail) && !text(d.nomEmail).includes('@')) return 'Enter a valid nominee e-mail address.';
  return '';
}

/** Age in whole years from an ISO date ('' when unknown). */
export function ageFrom(dob) {
  if (!dob) return '';
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) age -= 1;
  return age >= 0 && age < 130 ? `${age} yrs` : '';
}

const pinInput = (value) => String(value).replace(/\D/g, '').slice(0, 6);

export function CustomerProfileFields({ value, onChange, withCommunicationAddress = true }) {
  const set = (key, fn = (v) => v) => (e) => onChange({ ...value, [key]: fn(e.target.value) });
  const sameAsComm = () => onChange({
    ...value, permAddress: value.address, permAddress2: value.address2, permCity: value.city,
    permState: value.state, permPincode: value.pincode,
  });
  const dobField = (key, label) => (
    <label>{label}
      <input type="date" value={value[key]} max={new Date().toISOString().slice(0, 10)} onChange={set(key)} />
      {ageFrom(value[key]) && <small className="field-hint">Age: {ageFrom(value[key])}</small>}
    </label>
  );

  return (
    <>
      <h3 className="form-section">Personal details</h3>
      <div className="form-grid">
        {dobField('dob', 'Date of birth')}
        <label>Occupation<input value={value.occupation} onChange={set('occupation')} maxLength={80} /></label>
        <label>Father / Husband / Guardian&apos;s name<input value={value.guardian} onChange={set('guardian')} maxLength={120} /></label>
        {withCommunicationAddress && (
          <>
            <label className="span-2">Address for communication<input value={value.address} onChange={set('address')} maxLength={300} placeholder="House / street / area" /></label>
            <label className="span-2"><input value={value.address2} onChange={set('address2')} maxLength={300} placeholder="Address line 2 (optional)" aria-label="Address line 2" /></label>
            <label>City / Town / Village<input value={value.city} onChange={set('city')} maxLength={80} /></label>
            <label>State<input value={value.state} onChange={set('state')} maxLength={60} /></label>
            <label>Pin code<input value={value.pincode} onChange={set('pincode', pinInput)} inputMode="numeric" maxLength={6} /></label>
          </>
        )}
      </div>

      <h3 className="form-section">
        Permanent address
        <button type="button" className="text-button" onClick={sameAsComm}>Same as communication address</button>
      </h3>
      <div className="form-grid">
        <label className="span-2"><input value={value.permAddress} onChange={set('permAddress')} maxLength={300} placeholder="House / street / area" aria-label="Permanent address" /></label>
        <label className="span-2"><input value={value.permAddress2} onChange={set('permAddress2')} maxLength={300} placeholder="Address line 2 (optional)" aria-label="Permanent address line 2" /></label>
        <label>City / Town / Village<input value={value.permCity} onChange={set('permCity')} maxLength={80} /></label>
        <label>State<input value={value.permState} onChange={set('permState')} maxLength={60} /></label>
        <label>Pin code<input value={value.permPincode} onChange={set('permPincode', pinInput)} inputMode="numeric" maxLength={6} /></label>
      </div>

      <h3 className="form-section">Nominee details</h3>
      <div className="form-grid">
        <label>Name<input value={value.nomName} onChange={set('nomName')} maxLength={120} /></label>
        <label>Relationship<input value={value.nomRelation} onChange={set('nomRelation')} maxLength={60} placeholder="e.g. Spouse, Son" /></label>
        {dobField('nomDob', 'Date of birth')}
        <label>Contact no.(s)<input value={value.nomPhone} onChange={set('nomPhone')} maxLength={60} /></label>
        <label>E-mail ID<input type="email" value={value.nomEmail} onChange={set('nomEmail')} maxLength={254} /></label>
        <label className="span-2">Address for communication<input value={value.nomAddress} onChange={set('nomAddress')} maxLength={300} /></label>
        <label>City / Town / Village<input value={value.nomCity} onChange={set('nomCity')} maxLength={80} /></label>
        <label>State<input value={value.nomState} onChange={set('nomState')} maxLength={60} /></label>
        <label>Pin code<input value={value.nomPincode} onChange={set('nomPincode', pinInput)} inputMode="numeric" maxLength={6} /></label>
      </div>
    </>
  );
}

/** Read-only view of the saved details (customer profile page). Returns null when nothing was filled in. */
export function CustomerDetailsView({ customer }) {
  const d = detailsFromCustomer(customer);
  const age = (dob) => (ageFrom(dob) ? ` (${ageFrom(dob)})` : '');
  const place = (...parts) => parts.filter(Boolean).join(', ');
  const personal = [
    ['Date of birth & age', d.dob ? `${d.dob}${age(d.dob)}` : ''], ['Occupation', d.occupation],
    ["Father / Husband / Guardian's name", d.guardian],
    ['Communication address', place(d.address, d.address2, d.city, d.state, d.pincode)],
    ['Permanent address', place(d.permAddress, d.permAddress2, d.permCity, d.permState, d.permPincode)],
  ].filter(([, v]) => v);
  const nominee = [
    ['Name', d.nomName], ['Relationship', d.nomRelation], ['Date of birth & age', d.nomDob ? `${d.nomDob}${age(d.nomDob)}` : ''],
    ['Contact no.(s)', d.nomPhone], ['E-mail ID', d.nomEmail], ['Address', place(d.nomAddress, d.nomCity, d.nomState, d.nomPincode)],
  ].filter(([, v]) => v);
  if (!personal.length && !nominee.length) return null;
  const block = (title, rows) => rows.length > 0 && (
    <div>
      <h3 className="sheet-h">{title}</h3>
      <dl className="detail-list">
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
    </div>
  );
  return (
    <div className="panel customer-details">
      {block('Personal details', personal)}
      {block('Nominee details', nominee)}
    </div>
  );
}
