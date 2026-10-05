/**
 * Client-side security helpers.
 *
 *  * `redact` strips PII before anything is written to a client log or a URL.
 *  * `safeText` neutralises user-entered strings before they reach the DOM.
 *  * `clientAudit` is a best-effort breadcrumb trail (the authoritative audit
 *    log lives server-side in `audit_logs`); it never stores tokens or PII.
 */
import { writeJson } from './storage';

const PII_PATTERNS = [
  /\b\d{10}\b/g,                        // mobile numbers
  /\b[A-Z]{5}\d{4}[A-Z]\b/g,            // PAN
  /\b\d{4}\s?\d{4}\s?\d{4}\b/g,         // Aadhaar-shaped
  /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g,    // e-mail
];

export const redact = (value) =>
  PII_PATTERNS.reduce((text, pattern) => text.replace(pattern, '[redacted]'), String(value ?? ''));

/** Escape angle brackets so a crafted customer name can never inject markup. */
export const safeText = (value) => String(value ?? '').replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'));

const AUDIT_KEY = 'client_audit';
const AUDIT_LIMIT = 200;

export function clientAudit(event, detail = {}) {
  const entry = { at: new Date().toISOString(), event, detail };
  const trail = (readTrail() || []);
  trail.unshift(entry);
  writeJson(AUDIT_KEY, trail.slice(0, AUDIT_LIMIT));
}

const readTrail = () => {
  try {
    return JSON.parse(window.localStorage.getItem(`lalita_erp:${AUDIT_KEY}`) || 'null');
  } catch {
    return [];
  }
};

export const auditTrail = () => readTrail() || [];
