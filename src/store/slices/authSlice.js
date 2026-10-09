/**
 * Authentication / identity slice.
 *
 * Holds the signed-in *session* (role + user), the team directory shown in
 * User & Role management, and the connection mode. Tokens themselves are kept
 * by `api/client` (memory + sessionStorage) — never in Redux, so they never
 * land in a devtools snapshot or a persisted slice.
 */
import { createSlice } from '@reduxjs/toolkit';
import { ROLES, ROLE_ORDER, toUiRole } from '../../constants/roles';
import { roleConfigs, seedUsers } from '../../data/seedData';
import { readJson } from '../../utils/storage';
import { clientAudit, redact } from '../../utils/security';

const defaultUserFor = (role = ROLES.ADMIN) =>
  roleConfigs[role]?.defaultUser || { name: 'Workspace User', email: `${role.toLowerCase().replace(/\s+/g, '')}@lalitainfra.com`, role };

/**
 * Role/session are persisted with writeJson, so read them with readJson. Older
 * builds re-wrapped the value in quotes on every reload ("\"\\\"ADMIN...");
 * peel those layers off and accept only a known role.
 */
const readStoredRole = (key) => {
  let value = readJson(key, '');
  for (let i = 0; i < 20 && typeof value === 'string' && /^\s*"/.test(value); i += 1) {
    try { value = JSON.parse(value); } catch { break; }
  }
  const role = toUiRole(value);
  return ROLE_ORDER.includes(role) ? role : '';
};

const initialState = {
  /** Role string of the active session ('' = signed out). */
  session: readStoredRole('session'),
  role: readStoredRole('role') || ROLES.ADMIN,
  users: readJson('users', null) || seedUsers,
  currentUser: readJson('current_user', null) || defaultUserFor(ROLES.ADMIN),
  permissions: [],
  /** 'demo' until the backend handshake succeeds, then 'live'. */
  mode: 'demo',
  status: 'idle',
  error: '',
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Local sign-in (demo mode, or fallback when the API is unreachable). */
    signedIn(state, action) {
      const { role, user, permissions = [] } = action.payload || {};
      state.session = role;
      state.role = role;
      state.permissions = permissions;
      state.currentUser = user || defaultUserFor(role);
      state.status = 'signedIn';
      state.error = '';
      clientAudit('auth.login', { role, mode: state.mode });
    },
    /** Sign-in confirmed by the API; store the server-side identity. */
    sessionLoaded(state, action) {
      const { user, permissions = [] } = action.payload || {};
      state.mode = 'live';
      state.status = 'signedIn';
      state.error = '';
      if (user) {
        const uiRole = toUiRole(user.role);
        state.session = uiRole;
        state.role = uiRole;
        state.currentUser = {
          id: user.public_id || user.id,
          name: user.name,
          email: user.email,
          role: uiRole,
          title: user.title || '',
          phone: user.phone || '',
          agentCode: user.agent_code || '',
          tenantId: user.tenant_id ?? null,
          tenantName: user.tenant_name || '',
          tenantSlug: user.tenant_slug || '',
        };
        state.permissions = permissions.length ? permissions : user.permissions || [];
      }
    },
    sessionFailed(state) {
      state.mode = 'demo';
      state.status = 'idle';
    },
    signedOut(state) {
      state.session = '';
      state.permissions = [];
      state.currentUser = defaultUserFor(ROLES.ADMIN);
      state.role = ROLES.ADMIN;
      state.status = 'idle';
      clientAudit('auth.logout', {});
    },
    userSaved(state, action) {
      const user = action.payload;
      const index = state.users.findIndex((u) => u.id === user.id);
      if (index >= 0) state.users[index] = { ...state.users[index], ...user };
      else state.users.unshift(user);
    },
    userRemoved(state, action) {
      state.users = state.users.filter((u) => u.id !== action.payload);
    },
    authError(state, action) {
      state.status = 'error';
      // Never echo raw credentials/PII back into the UI state.
      state.error = redact(action.payload || 'Sign-in failed');
    },
  },
});

export const {
  signedIn, sessionLoaded, sessionFailed, signedOut, userSaved, userRemoved, authError,
} = authSlice.actions;
export default authSlice.reducer;
