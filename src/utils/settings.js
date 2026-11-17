/**
 * Administration settings — organisation profile, tax rules and bank details.
 * Persisted in localStorage and read at the point of use (thunks, reports,
 * print sheets) so a saved change takes effect immediately.
 */
import { COMPANY } from '../data/appConfig';

import { readJson, writeJson } from './storage';

/** Which organisation the signed-in user belongs to (null offline / for the sample company). */
let tenant = null;
export function setSettingsTenant(next) {
  const same = (next?.slug || null) === (tenant?.slug || null) && (next?.name || null) === (tenant?.name || null);
  tenant = next && next.slug ? { slug: next.slug, name: next.name || next.slug } : null;
  if (!same) applyCompany();
}

// Every organisation starts from its own name with blank address / GSTIN / phone / email until it fills them in.
const defaultCompany = () => ({ name: tenant?.name || '', address: '', gstin: '', phone: '', email: '' });
const settingsKey = () => (tenant ? `admin_settings:${tenant.slug}` : 'admin_settings');

export const DEFAULT_SETTINGS = {
  company: { name: '', address: '', gstin: '', phone: '', email: '' },
  tax: {
    receiptPrefix: 'RCT', defaultGst: '0.18', tdsRate: '5', dueDays: '15',
    holdDays: '7', installmentDays: '30', defaultCommission: '2',
  },
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
