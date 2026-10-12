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
import { clearStorage, readSession, writeSession, writeText } from '../utils/storage';

const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';

// Credentials live in sessionStorage (this tab only). Drop any copy an older build left in localStorage.
writeText(ACCESS_KEY, '');
writeText(REFRESH_KEY, '');
let accessToken = readSession(ACCESS_KEY, '');
let refreshToken = readSession(REFRESH_KEY, '');
let refreshInFlight = null;

const FIELD_LABEL = {
  phone: 'Mobile', email: 'E-mail', name: 'Name', code: 'Code', commission_rate: 'Commission rate', password: 'Password',
  new_password: 'New password', pincode: 'Pincode', address: 'Address', city: 'City', gstin: 'GSTIN', pan_number: 'PAN',
  final_price: 'Price', amount: 'Amount', price: 'Price', area_sqft: 'Area', plot_number: 'Plot number', slug: 'Slug',
};
const labelFor = (field) => FIELD_LABEL[field] || String(field || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** A readable message: for a validation failure, name each field the server rejected and why. */
function describeError(error, response) {
  const details = Array.isArray(error.details) ? error.details : [];
  const named = details.filter((d) => d && d.field && d.message);
  if (response.status === 422 && named.length) {
    return named.map((d) => `${labelFor(String(d.field).split('.').pop())}: ${String(d.message).replace(/^(Value error|Assertion failed),?\s*/i, '')}`).join('; ');
  }
  return error.message || response.statusText || 'Request failed';
}

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
  writeSession(ACCESS_KEY, accessToken);
  writeSession(REFRESH_KEY, refreshToken);
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
      throw new ApiError(describeError(error, response), {
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

/**
 * Authenticated binary download (PDF bills, CSV exports).
 * Returns a `Blob`; falls back to the same error contract as `request`.
 */
export async function requestBlob(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(buildUrl(path), {
      method: 'GET',
      signal: controller.signal,
      credentials: 'omit',
      headers: { Accept: 'application/pdf', 'X-Requested-With': 'XMLHttpRequest', ...authHeaders() },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new ApiError(payload?.error?.message || response.statusText || 'Download failed', {
        status: response.status,
        code: payload?.error?.code || `http_${response.status}`,
      });
    }
    return await response.blob();
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
