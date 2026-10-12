/**
 * Tenants slice — the platform control plane (SUPER ADMIN only).
 *
 * In live mode the list comes from `/tenants`; offline (demo) it starts from the
 * seed below and every change is kept in the browser. Shape mirrors the API
 * (`TenantResponse` + admins) so one UI serves both.
 */
import { createSlice } from '@reduxjs/toolkit';
import { readJson } from '../../utils/storage';

const initialState = {
  items: readJson('tenants', null) || [],
  status: 'idle', // idle | loading | ready
  error: '',
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
  },
});

export const {
  tenantsLoading, tenantsLoaded, tenantsFailed, tenantUpserted,
} = tenantsSlice.actions;
export default tenantsSlice.reducer;
