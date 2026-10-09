/**
 * Platform console actions (SUPER ADMIN). Live mode talks to `/tenants`; demo mode
 * keeps the same shapes in the store so the console behaves identically offline.
 * Passwords are never stored: a one-time credential is surfaced once, then cleared.
 */
import { api, actions } from '../api/resources';
import { ApiUnavailableError } from '../api/client';
import { clientAudit } from '../utils/security';
import { generatePassword, slugify } from '../utils/tenants';
import { toastPushed } from './slices/uiSlice';
import {
  credentialShown, tenantUpserted, tenantsFailed, tenantsLoaded, tenantsLoading,
} from './slices/tenantsSlice';

const isLive = (getState) => getState().auth.mode === 'live';

/** The list endpoint omits the admin list (the detail view loads it); keep what this tenant already has. */
const mergeAdmins = (state, tenant) => {
  const known = state.tenants.items.find((t) => t.id === tenant.id && t.public_id === tenant.public_id);
  return { ...tenant, admins: tenant.admins || known?.admins };
};

export const loadTenants = () => async (dispatch, getState) => {
  if (!isLive(getState)) return;
  dispatch(tenantsLoading());
  try {
    const response = await api.tenants.list({ page_size: 200 });
    const state = getState();
    dispatch(tenantsLoaded(response.data.map((t) => mergeAdmins(state, t))));
  } catch (error) {
    dispatch(tenantsFailed(error instanceof ApiUnavailableError ? '' : error.message));
  }
};

/** Pull one tenant with its admins (detail view). */
export const loadTenantDetail = (tenant) => async (dispatch, getState) => {
  if (!isLive(getState)) return;
  try {
    const response = await api.tenants.get(tenant.id);
    dispatch(tenantUpserted(response.data));
  } catch (error) {
    dispatch(toastPushed(`Could not load ${tenant.name}: ${error.message}`));
  }
};

const apiBody = (form) => ({
  name: form.name.trim(),
  plan: form.plan,
  max_users: Number(form.max_users),
  contact_name: form.contact_name.trim() || null,
  contact_email: form.contact_email.trim() || null,
  contact_phone: form.contact_phone.trim() || null,
  notes: form.notes.trim() || null,
});

const adminBody = (admin) => ({
  name: admin.name.trim(),
  email: admin.email.trim().toLowerCase(),
  ...(admin.phone?.trim() ? { phone: admin.phone.trim() } : {}),
  ...(admin.temporary_password ? { temporary_password: admin.temporary_password } : {}),
});

const showCredential = (dispatch, { tenantName, email, password }) => {
  if (password) dispatch(credentialShown({ tenantName, email, password }));
};

/** Create (editing = null) or update a tenant. Returns true on success. */
export const saveTenant = (form, editing = null) => async (dispatch, getState) => {
  const live = isLive(getState);
  try {
    if (editing) {
      if (live) {
        const response = await api.tenants.update(editing.id, apiBody(form));
        dispatch(tenantUpserted(mergeAdmins(getState(), response.data)));
      } else {
        dispatch(tenantUpserted({ ...editing, ...apiBody(form), name: form.name.trim() }));
      }
      dispatch(toastPushed(`${form.name.trim()} updated`));
      clientAudit('tenant.updated', { id: editing.id });
      return true;
    }

    if (live) {
      const response = await api.tenants.create({
        ...apiBody(form),
        slug: form.slug.trim() || slugify(form.name),
        admin: adminBody(form.admin),
      });
      const { tenant, admin, initial_password: password } = response.data;
      dispatch(tenantUpserted({ ...tenant, admins: [admin] }));
      showCredential(dispatch, { tenantName: tenant.name, email: admin.email, password });
    } else {
      const state = getState().tenants.items;
      const id = Math.max(0, ...state.map((t) => t.id)) + 1;
      const password = form.admin.temporary_password ? null : generatePassword();
      dispatch(tenantUpserted({
        id, public_id: `TEN-${String(id).padStart(8, '0')}`, ...apiBody(form), name: form.name.trim(),
        slug: form.slug.trim() || slugify(form.name), status: 'ACTIVE',
        suspended_at: null, suspended_reason: null, created_at: new Date().toISOString(),
        usage: { users: 1, projects: 0, plots: 0, customers: 0, bookings: 0 },
        admins: [{ id: id * 100 + 1, name: form.admin.name.trim(), email: form.admin.email.trim().toLowerCase(), status: 'ACTIVE', must_change_password: true }],
      }));
      showCredential(dispatch, { tenantName: form.name.trim(), email: form.admin.email.trim().toLowerCase(), password });
    }
    dispatch(toastPushed(`Organisation ${form.name.trim()} created`));
    clientAudit('tenant.created', { name: form.name.trim() });
    return true;
  } catch (error) {
    dispatch(toastPushed(`Could not save: ${error.message}`));
    return false;
  }
};

export const suspendTenant = (tenant, reason) => async (dispatch, getState) => {
  try {
    if (isLive(getState)) {
      const response = await actions.suspendTenant(tenant.id, { reason });
      dispatch(tenantUpserted(mergeAdmins(getState(), response.data)));
    } else {
      dispatch(tenantUpserted({ ...tenant, status: 'SUSPENDED', suspended_reason: reason, suspended_at: new Date().toISOString() }));
    }
    dispatch(toastPushed(`${tenant.name} suspended — all its users are locked out`));
    clientAudit('tenant.suspended', { id: tenant.id });
    return true;
  } catch (error) {
    dispatch(toastPushed(`Could not suspend: ${error.message}`));
    return false;
  }
};

export const activateTenant = (tenant) => async (dispatch, getState) => {
  try {
    if (isLive(getState)) {
      const response = await actions.activateTenant(tenant.id);
      dispatch(tenantUpserted(mergeAdmins(getState(), response.data)));
    } else {
      dispatch(tenantUpserted({ ...tenant, status: 'ACTIVE', suspended_reason: null, suspended_at: null }));
    }
    dispatch(toastPushed(`${tenant.name} reactivated`));
    clientAudit('tenant.activated', { id: tenant.id });
    return true;
  } catch (error) {
    dispatch(toastPushed(`Could not reactivate: ${error.message}`));
    return false;
  }
};

export const addTenantAdmin = (tenant, form) => async (dispatch, getState) => {
  try {
    let admin;
    let password = null;
    if (isLive(getState)) {
      const response = await actions.addTenantAdmin(tenant.id, adminBody(form));
      admin = response.data.admin;
      password = response.data.initial_password;
    } else {
      admin = { id: Date.now(), name: form.name.trim(), email: form.email.trim().toLowerCase(), status: 'ACTIVE', must_change_password: true };
      password = form.temporary_password ? null : generatePassword();
    }
    dispatch(tenantUpserted({
      ...tenant,
      admins: [...(tenant.admins || []), admin],
      usage: { ...tenant.usage, users: (tenant.usage?.users ?? 0) + 1 },
    }));
    showCredential(dispatch, { tenantName: tenant.name, email: admin.email, password });
    dispatch(toastPushed(`Administrator ${admin.email} added to ${tenant.name}`));
    clientAudit('tenant.admin_added', { id: tenant.id });
    return true;
  } catch (error) {
    dispatch(toastPushed(`Could not add administrator: ${error.message}`));
    return false;
  }
};

export const resetTenantAdminPassword = (tenant, admin) => async (dispatch, getState) => {
  try {
    const password = isLive(getState)
      ? (await actions.resetTenantAdminPassword(tenant.id, admin.id)).data.initial_password
      : generatePassword();
    showCredential(dispatch, { tenantName: tenant.name, email: admin.email, password });
    dispatch(toastPushed(`New one-time password issued for ${admin.email}`));
    clientAudit('tenant.admin_password_reset', { id: tenant.id });
    return true;
  } catch (error) {
    dispatch(toastPushed(`Could not reset password: ${error.message}`));
    return false;
  }
};
