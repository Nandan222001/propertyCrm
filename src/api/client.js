/**
 * Single HTTP client for the whole SPA.
 *
 * Security properties:
 *  - tokens live in memory first; sessionStorage only bridges page reloads (a
 *    closed tab drops them, shrinking the XSS/live-token window);
 *  - every request carries a correlation id (`X-Request-Id`) that the backend
 *    logs, so a support ticket maps to one audit trail;
 *  - responses are parsed through the standard envelope, never via `res.json()`
 *    sprinkled through components;
 *  - a 401 triggers exactly one refresh attempt (single-flight) before the
 *    session is dropped — no request storms against the auth endpoint.
 */
import { API_BASE_URL, API_TIMEOUT_MS } from '../constants/api';
import { newId } from '../utils/id';
import { clearStorage, readText, writeText } from '../utils/storage';

const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';

let accessToken = readText(ACCESS_KEY, '');
let refreshToken = readText(REFRESH_KEY, '');
let refreshInFlight = null;

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'request_failed', details = null, requestId = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

/** Thrown when the backend is unreachable (offline preview / demo mode). */
export class ApiUnavailableError extends ApiError {
  constructor(message = 'API unavailable') {
    super(message, { status: 0, code: 'api_unavailable' });
    this.name = 'ApiUnavailableError';
  }
}

export const setTokens = ({ access_token: access, refresh_token: refresh } = {}) => {
  accessToken = access || '';
  refreshToken = refresh || '';
  writeText(ACCESS_KEY, accessToken);
  writeText(REFRESH_KEY, refreshToken);
};

export const clearTokens = () => {
  accessToken = '';
  refreshToken = '';
  clearStorage();
};

export const hasSession = () => Boolean(accessToken);
export const authHeaders = () => (accessToken ? { Authorization: `Bearer ${accessToken}` } : {});

const buildUrl = (path, params) => {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const query = new URLSearchParams(
    Object.entries(params || {})
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [key, String(value)]),
  ).toString();
  return query ? `${url}?${query}` : url;
};

export async function request(path, { method = 'GET', body, params, auth = true, signal } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const requestId = newId();
  try {
    const response = await fetch(buildUrl(path, params), {
      method,
      signal: signal || controller.signal,
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Request-Id': requestId,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(auth ? authHeaders() : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = payload?.error || {};
      throw new ApiError(error.message || response.statusText || 'Request failed', {
        status: response.status,
        code: error.code || `http_${response.status}`,
        details: error.details ?? null,
        requestId: payload?.request_id || error.request_id || requestId,
      });
    }
    return {
      data: payload?.data ?? null,
      meta: payload?.meta ?? null,
      message: payload?.message || '',
      requestId: payload?.request_id || requestId,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') {
      throw new ApiError('The server took too long to respond', { code: 'timeout' });
    }
    throw new ApiUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}

/** Exchange the refresh token for a new pair; concurrent callers share one flight. */
function refreshSession() {
  if (!refreshToken) return Promise.reject(new ApiError('No refresh token', { status: 401, code: 'no_refresh_token' }));
  if (!refreshInFlight) {
    refreshInFlight = request('/auth/refresh', { method: 'POST', body: { refresh_token: refreshToken }, auth: false })
      .then(({ data }) => {
        setTokens(data?.tokens || data);
        return accessToken;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/** Authenticated request that transparently retries once after a refresh. */
export async function authedRequest(path, options = {}) {
  try {
    return await request(path, { ...options, auth: true });
  } catch (error) {
    if (error.status === 401 && refreshToken) {
      await refreshSession().catch(() => {
        clearTokens();
        throw error;
      });
      return request(path, { ...options, auth: true });
    }
    throw error;
  }
}
