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
import { readJson } from '../../utils/storage';
import { clientAudit, redact } from '../../utils/security';

/** Nobody is signed in until the server says so: an empty identity, never a sample person. */
const defaultUserFor = (role = ROLES.ADMIN) => ({ name: '', email: '', role });

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
  loginNotice: '',
  /** False only while the team list is being fetched (so counts can read "Loading…"). */
  usersReady: true,
  /** Role string of the active session ('' = signed out). */
  session: readStoredRole('session'),
  /** True while a session restored from this browser has not yet been confirmed by the server. */
  needsVerification: Boolean(readStoredRole('session')),
  role: readStoredRole('role') || ROLES.ADMIN,
  users: [],
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
    /** Local session (used by the render tests; real sign-in goes through `sessionLoaded`). */
    signedIn(state, action) {
      const { role, user, permissions = [] } = action.payload || {};
      state.session = role;
      state.role = role;
      state.permissions = permissions;
      state.currentUser = user || defaultUserFor(role);
      state.needsVerification = false;
      state.status = 'signedIn';
      state.error = '';
      clientAudit('auth.login', { role, mode: state.mode });
    },
    /** Sign-in confirmed by the API; store the server-side identity. */
    sessionLoaded(state, action) {
      const { user, permissions = [] } = action.payload || {};
      state.mode = 'live';
      state.needsVerification = false;
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
          mustChangePassword: Boolean(user.must_change_password),
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
      state.needsVerification = false;
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
    /** Replace the team list (live mode: the signed-in organisation's real users). */
    /** One-line message shown on the sign-in screen (e.g. after a password change). */
    loginNoticeSet(state, action) {
      state.loginNotice = action.payload || '';
    },
    passwordChangeCleared(state) {
      if (state.currentUser) state.currentUser.mustChangePassword = false;
    },
    usersLoading(state) {
      state.usersReady = false;
    },
    usersFailed(state) {
      state.usersReady = true;
    },
    usersLoaded(state, action) {
      state.users = action.payload;
      state.usersReady = true;
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
  signedIn, sessionLoaded, sessionFailed, signedOut, userSaved, usersLoaded, usersLoading, usersFailed, userRemoved, authError, loginNoticeSet, passwordChangeCleared,
} = authSlice.actions;
export default authSlice.reducer;
