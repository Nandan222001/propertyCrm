/**
 * Tenants slice — the platform control plane (SUPER ADMIN only).
 *
 * In live mode the list comes from `/tenants`; offline (demo) it starts from the
 * seed below and every change is kept in the browser. Shape mirrors the API
 * (`TenantResponse` + admins) so one UI serves both.
 */
import { createSlice } from '@reduxjs/toolkit';
import { readJson } from '../../utils/storage';

const seedTenants = [
  {
    id: 1, public_id: 'TEN-DEMO0001', name: 'Lalita Realestate Infra', slug: 'lalita', status: 'ACTIVE', plan: 'ENTERPRISE',
    max_users: 100, contact_name: 'Arjun Shah', contact_email: 'accounts@lalitainfra.com', contact_phone: '+91 98765 00001',
    notes: 'Flagship organisation', suspended_at: null, suspended_reason: null, created_at: '2026-03-02T09:00:00Z',
    usage: { users: 7, projects: 4, plots: 384, customers: 8, bookings: 8 },
    admins: [{ id: 101, name: 'Arjun Shah', email: 'admin@lalitainfra.com', status: 'ACTIVE', must_change_password: false }],
  },
  {
    id: 2, public_id: 'TEN-DEMO0002', name: 'Skyline Realty', slug: 'skyline', status: 'ACTIVE', plan: 'STANDARD',
    max_users: 25, contact_name: 'Priya Menon', contact_email: 'hello@skyline.demo', contact_phone: '+91 98765 11001',
    notes: '', suspended_at: null, suspended_reason: null, created_at: '2026-06-18T11:30:00Z',
    usage: { users: 1, projects: 1, plots: 3, customers: 0, bookings: 0 },
    admins: [{ id: 102, name: 'Priya Menon', email: 'admin@skyline.demo', status: 'ACTIVE', must_change_password: false }],
  },
  {
    id: 3, public_id: 'TEN-DEMO0003', name: 'Horizon Developers', slug: 'horizon', status: 'SUSPENDED', plan: 'TRIAL',
    max_users: 5, contact_name: 'Kabir Anand', contact_email: 'kabir@horizon.demo', contact_phone: '',
    notes: 'Trial organisation', suspended_at: '2026-09-20T08:00:00Z', suspended_reason: 'Trial period ended', created_at: '2026-08-05T10:15:00Z',
    usage: { users: 2, projects: 0, plots: 0, customers: 0, bookings: 0 },
    admins: [{ id: 103, name: 'Kabir Anand', email: 'kabir@horizon.demo', status: 'ACTIVE', must_change_password: true }],
  },
];

const initialState = {
  items: readJson('tenants', null) || seedTenants,
  status: 'idle', // idle | loading | ready
  error: '',
  /** One-time credential to show after create / add admin / reset password. */
  credential: null,
};

const tenantsSlice = createSlice({
  name: 'tenants',
  initialState,
  reducers: {
    tenantsLoading(state) { state.status = 'loading'; },
    tenantsLoaded(state, action) {
      state.items = action.payload;
      state.status = 'ready';
      state.error = '';
    },
    tenantsFailed(state, action) {
      state.status = 'ready';
      state.error = action.payload || '';
    },
    tenantUpserted(state, action) {
      const tenant = action.payload;
      const index = state.items.findIndex((t) => t.id === tenant.id);
      if (index >= 0) state.items[index] = { ...state.items[index], ...tenant };
      else state.items.unshift(tenant);
    },
    credentialShown(state, action) { state.credential = action.payload; },
    credentialCleared(state) { state.credential = null; },
  },
});

export const {
  tenantsLoading, tenantsLoaded, tenantsFailed, tenantUpserted, credentialShown, credentialCleared,
} = tenantsSlice.actions;
export default tenantsSlice.reducer;
