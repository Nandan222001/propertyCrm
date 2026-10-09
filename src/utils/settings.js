/**
 * Administration settings — organisation profile, tax rules and bank details.
 * Persisted in localStorage and read at the point of use (thunks, reports,
 * print sheets) so a saved change takes effect immediately.
 */
import { COMPANY } from '../data/seedData';
import { readJson, writeJson } from './storage';

export const DEFAULT_SETTINGS = {
  company: { ...COMPANY },
  tax: { receiptPrefix: 'RCT', defaultGst: '0.18', tdsRate: '5', dueDays: '15' },
  bank: { bankName: '', accountName: '', accountNumber: '', ifsc: '', upi: '' },
};

export function getSettings() {
  const saved = readJson('admin_settings', {}) || {};
  return {
    company: { ...DEFAULT_SETTINGS.company, ...(saved.company || {}) },
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
  writeJson('admin_settings', next);
  if (section === 'company') applyCompany(values);
  return next;
}

export function resetSettingsSection(section) {
  return saveSettingsSection(section, { ...DEFAULT_SETTINGS[section] });
}

applyCompany();
