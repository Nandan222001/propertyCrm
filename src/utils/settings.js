/**
 * Administration settings — organisation profile, tax rules and bank details.
 * Persisted in localStorage and read at the point of use (thunks, reports,
 * print sheets) so a saved change takes effect immediately.
 */
import { COMPANY } from '../data/seedData';

const COMPANY_SAMPLE = { ...COMPANY };
import { readJson, writeJson } from './storage';

/** Which organisation the signed-in user belongs to (null offline / for the sample company). */
let tenant = null;
export function setSettingsTenant(next) {
  const same = (next?.slug || null) === (tenant?.slug || null) && (next?.name || null) === (tenant?.name || null);
  tenant = next && next.slug ? { slug: next.slug, name: next.name || next.slug } : null;
  if (!same) applyCompany();
}

// Only the seeded sample company ('lalita') keeps the sample letterhead; any other organisation
// starts from its own name with blank address / GSTIN / phone / email until it fills them in.
const isSample = () => !tenant || tenant.slug === 'lalita';
const defaultCompany = () => (isSample() ? { ...COMPANY_SAMPLE } : { name: tenant.name, address: '', gstin: '', phone: '', email: '' });
const settingsKey = () => (tenant && !isSample() ? `admin_settings:${tenant.slug}` : 'admin_settings');

export const DEFAULT_SETTINGS = {
  company: { ...COMPANY },
  tax: { receiptPrefix: 'RCT', defaultGst: '0.18', tdsRate: '5', dueDays: '15' },
  bank: { bankName: '', accountName: '', accountNumber: '', ifsc: '', upi: '' },
};

/**
 * Against the real API the organisation's settings live on the server (the same letterhead,
 * bank details and tax rules for every user and device). `remote` holds the loaded copy;
 * null means offline preview, which keeps using this browser's local copy.
 */
let remote = null;
export const usesRemoteSettings = () => remote !== null;
export function setRemoteSettings(data) {
  remote = data ? { company: data.company || {}, tax: data.tax || {}, bank: data.bank || {} } : null;
  applyCompany();
}

export function getSettings() {
  const saved = remote !== null ? remote : (readJson(settingsKey(), {}) || {});
  return {
    company: { ...defaultCompany(), ...(saved.company || {}) },
    tax: { ...DEFAULT_SETTINGS.tax, ...(saved.tax || {}) },
    bank: { ...DEFAULT_SETTINGS.bank, ...(saved.bank || {}) },
  };
}

/** Print sheets read the shared COMPANY object, so keep it in step with the saved profile. */
export function applyCompany(company = getSettings().company) {
  Object.assign(COMPANY, company);
}

export function saveSettingsSection(section, values) {
  const next = { ...getSettings(), [section]: values };
  writeJson(settingsKey(), next);
  if (section === 'company') applyCompany(values);
  return next;
}

export function resetSettingsSection(section) {
  return saveSettingsSection(section, section === 'company' ? defaultCompany() : { ...DEFAULT_SETTINGS[section] });
}

applyCompany();
