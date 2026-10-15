/** Tenant helpers shared by the console, the dashboard and the demo-mode store. */

export const TENANT_PLANS = ['TRIAL', 'STANDARD', 'ENTERPRISE'];
export const PLAN_LABEL = { TRIAL: 'Trial', STANDARD: 'Standard', ENTERPRISE: 'Enterprise' };
export const RESERVED_SLUGS = ['platform', 'admin', 'api', 'www', 'app', 'support', 'root', 'system'];

export const slugify = (name) => {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
  return slug;
};

import { isValidMobile, MOBILE_HINT } from './phone';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export const seatUsage = (tenant) => {
  const used = tenant.usage?.users ?? 0;
  const pct = tenant.max_users ? Math.min(100, Math.round((used / tenant.max_users) * 100)) : 0;
  return { used, pct };
};

/**
 * Form -> first problem found, or ''. `tenants` lets us catch a duplicate slug / admin e-mail
 * (the API enforces this too; this just gives an instant message).
 */
export function validateTenant(form, { tenants = [], editing = null } = {}) {
  const name = form.name.trim();
  if (name.length < 2) return 'Organisation name must be at least 2 characters';
  if (name.length > 160) return 'Organisation name is too long (max 160)';
  if (!editing) {
    const slug = (form.slug || slugify(name)).trim();
    if (!SLUG_RE.test(slug)) return 'Slug may contain lowercase letters, digits and hyphens (2–48 characters)';
    if (RESERVED_SLUGS.includes(slug)) return `"${slug}" is a reserved slug`;
    if (tenants.some((t) => t.slug === slug)) return `The slug "${slug}" is already taken`;
  }
  const seats = Number(form.max_users);
  if (!Number.isInteger(seats) || seats < 1 || seats > 10000) return 'Seat limit must be a whole number between 1 and 10000';
  if (editing && seats < (editing.usage?.users ?? 0)) return `Seat limit cannot be below the ${editing.usage.users} users already in this organisation`;
  if (form.contact_email && !EMAIL_RE.test(form.contact_email)) return 'Contact e-mail is not valid';
  if (form.contact_phone && !/^[+\d][\d\s-]{6,}$/.test(form.contact_phone)) return 'Contact phone is not valid';
  if (!editing) {
    const admin = form.admin;
    if (admin.name.trim().length < 2) return 'Administrator name is required';
    if (!EMAIL_RE.test(admin.email.trim())) return 'Administrator e-mail is not valid';
    if (admin.name.replace(/[^A-Za-z]/g, '').length < 4) return 'Enter the administrator\'s name with at least 4 letters.';
    if (!isValidMobile(admin.phone)) return `Administrator mobile: ${MOBILE_HINT}`;
  }
  return '';
}

export const blankTenantForm = (tenant) => (tenant ? {
  name: tenant.name,
  slug: tenant.slug,
  plan: tenant.plan,
  max_users: String(tenant.max_users),
  contact_name: tenant.contact_name || '',
  contact_email: tenant.contact_email || '',
  contact_phone: tenant.contact_phone || '',
  notes: tenant.notes || '',
} : {
  name: '', slug: '', plan: 'STANDARD', max_users: '25',
  contact_name: '', contact_email: '', contact_phone: '', notes: '',
  admin: { name: '', email: '', phone: '' },
});

/** KPI roll-up used by the platform dashboard and the Tenants page tiles. */
export function platformStats(tenants = []) {
  const active = tenants.filter((t) => t.status === 'ACTIVE').length;
  const users = tenants.reduce((sum, t) => sum + (t.usage?.users ?? 0), 0);
  const seats = tenants.reduce((sum, t) => sum + (t.max_users ?? 0), 0);
  const plans = TENANT_PLANS.map((plan) => ({ plan, count: tenants.filter((t) => t.plan === plan).length }));
  return { total: tenants.length, active, suspended: tenants.length - active, users, seats, plans };
}
