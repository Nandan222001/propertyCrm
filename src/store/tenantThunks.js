/**
 * Platform console actions (SUPER ADMIN). Everything goes through `/tenants`: nothing is ever
 * "saved" only in the browser, so a success message always means the server really stored it.
 * Passwords are never shown or stored: the server sets a starting password from the name and mobile.
 */
import { api, actions } from '../api/resources';
import { ApiUnavailableError } from '../api/client';
import { clientAudit } from '../utils/security';
import { slugify } from '../utils/tenants';
import { toastPushed } from './slices/uiSlice';
import {
  tenantUpserted, tenantsFailed, tenantsLoaded, tenantsLoading,
} from './slices/tenantsSlice';

const isLive = (getState) => getState().auth.mode === 'live';
const NOT_CONNECTED = 'Not connected to the server, so nothing was saved. Please sign in again.';
const failure = (error) => (error instanceof ApiUnavailableError
  ? 'Cannot reach the server — nothing was saved.' : error.message);

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
    dispatch(tenantsFailed(failure(error)));
  }
};

/** Pull one tenant with its admins (detail view). */
export const loadTenantDetail = (tenant) => async (dispatch, getState) => {
  if (!isLive(getState)) return;
  try {
    const response = await api.tenants.get(tenant.id);
    dispatch(tenantUpserted(response.data));
  } catch (error) {
    dispatch(toastPushed(`Could not load ${tenant.name}: ${failure(error)}`));
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
  phone: String(admin.phone || '').trim(),
});

const PASSWORD_NOTE = 'Starting password: first 4 letters of the name + last 5 digits of the mobile — it is never displayed, and they must change it at first sign-in.';

/** Run a server call; resolves true only when the server accepted it. */
const run = (getState, dispatch, label, call, onDone) => (async () => {
  if (!isLive(getState)) {
    dispatch(toastPushed(NOT_CONNECTED));
    return false;
  }
  try {
    const result = await call();
    onDone(result);
    return true;
  } catch (error) {
    dispatch(toastPushed(`${label}: ${failure(error)}`));
    return false;
  }
})();

/** Create (editing = null) or update a tenant. Returns true on success. */
export const saveTenant = (form, editing = null) => (dispatch, getState) => run(
  getState, dispatch, 'Could not save',
  async () => {
    if (editing) return { editing: true, response: await api.tenants.update(editing.id, apiBody(form)) };
    return {
      editing: false,
      response: await api.tenants.create({ ...apiBody(form), slug: form.slug.trim() || slugify(form.name), admin: adminBody(form.admin) }),
    };
  },
  ({ editing: wasEdit, response }) => {
    if (wasEdit) {
      dispatch(tenantUpserted(mergeAdmins(getState(), response.data)));
      dispatch(toastPushed(`${form.name.trim()} updated`));
      clientAudit('tenant.updated', { id: editing.id });
    } else {
      const { tenant, admin } = response.data;
      dispatch(tenantUpserted({ ...tenant, admins: [admin] }));
      dispatch(toastPushed(`Organisation ${form.name.trim()} created. ${PASSWORD_NOTE}`));
      clientAudit('tenant.created', { name: form.name.trim() });
    }
  },
);

export const suspendTenant = (tenant, reason) => (dispatch, getState) => run(
  getState, dispatch, 'Could not suspend',
  () => actions.suspendTenant(tenant.id, { reason }),
  (response) => {
    dispatch(tenantUpserted(mergeAdmins(getState(), response.data)));
    dispatch(toastPushed(`${tenant.name} suspended — all its users are locked out`));
    clientAudit('tenant.suspended', { id: tenant.id });
  },
);

export const activateTenant = (tenant) => (dispatch, getState) => run(
  getState, dispatch, 'Could not reactivate',
  () => actions.activateTenant(tenant.id),
  (response) => {
    dispatch(tenantUpserted(mergeAdmins(getState(), response.data)));
    dispatch(toastPushed(`${tenant.name} reactivated`));
    clientAudit('tenant.activated', { id: tenant.id });
  },
);

export const addTenantAdmin = (tenant, form) => (dispatch, getState) => run(
  getState, dispatch, 'Could not add administrator',
  () => actions.addTenantAdmin(tenant.id, adminBody(form)),
  (response) => {
    const { admin } = response.data;
    dispatch(tenantUpserted({
      ...tenant,
      admins: [...(tenant.admins || []), admin],
      usage: { ...tenant.usage, users: (tenant.usage?.users ?? 0) + 1 },
    }));
    dispatch(toastPushed(`Administrator ${admin.email} added to ${tenant.name}. ${PASSWORD_NOTE}`));
    clientAudit('tenant.admin_added', { id: tenant.id });
  },
);

export const resetTenantAdminPassword = (tenant, admin) => (dispatch, getState) => run(
  getState, dispatch, 'Could not reset password',
  () => actions.resetTenantAdminPassword(tenant.id, admin.id),
  () => {
    dispatch(toastPushed(`Password for ${admin.email} was reset to the starting password. They must change it at next sign-in.`));
    clientAudit('tenant.admin_password_reset', { id: tenant.id });
  },
);
