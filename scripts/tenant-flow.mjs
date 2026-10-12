/**
 * Interaction test for the platform console: drives the real UI (click / type / submit)
 * as a SUPER ADMIN in jsdom and checks the multi-tenant behaviour end to end (demo mode).
 *
 *   node scripts/tenant-flow.mjs
 */
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Element', 'Node', 'Event', 'MouseEvent',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage']) {
  if (dom.window[key] !== undefined) Object.defineProperty(globalThis, key, { value: dom.window[key], writable: true, configurable: true });
}
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.URL = dom.window.URL;
globalThis.Blob = dom.window.Blob;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const outDir = path.join(process.cwd(), 'node_modules', '.cache', 'tenant-flow');
mkdirSync(outDir, { recursive: true });
const outfile = path.join(outDir, 'app.mjs');
await build({
  entryPoints: ['scripts/smoke-entry.jsx'], bundle: true, format: 'esm', outfile, platform: 'browser', jsx: 'automatic',
  loader: { '.js': 'jsx', '.jsx': 'jsx' },
  external: ['react', 'react-dom', 'react-dom/client', 'react-redux', 'react-router-dom', '@reduxjs/toolkit', 'lucide-react'],
  define: { 'import.meta.env': '{}' }, logLevel: 'error',
});

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { Provider } = await import('react-redux');
const { MemoryRouter } = await import('react-router-dom');
const { App, createStore, signedIn, sessionLoaded, hydrateWorkspace } = await import(pathToFileURL(outfile).href);

// Fixture organisations (the app itself ships with none).
const FIXTURES = [
  ['Lalita Realestate Infra', 'lalita', 'ENTERPRISE', 100, 'ACTIVE'],
  ['Skyline Realty', 'skyline', 'STANDARD', 25, 'ACTIVE'],
  ['Horizon Developers', 'horizon', 'TRIAL', 5, 'SUSPENDED'],
].map(([name, slug, plan, max_users, status], i) => ({
  id: i + 1, public_id: `TEN-FIX${i + 1}`, name, slug, plan, max_users, status, contact_name: '', contact_email: '', contact_phone: '', notes: '',
  suspended_at: status === 'SUSPENDED' ? '2026-09-20T08:00:00Z' : null, suspended_reason: status === 'SUSPENDED' ? 'Trial period ended' : null,
  created_at: `2026-0${i + 3}-02T09:00:00Z`, usage: { users: 1, projects: 0, plots: 0, customers: 0, bookings: 0 },
  admins: [{ id: (i + 1) * 100, name: `${name} Admin`, email: `admin@${slug}.test`, status: 'ACTIVE', must_change_password: false }],
}));

// A tiny stand-in for the platform API, so the console is exercised exactly as it runs against the server.
let server = JSON.parse(JSON.stringify(FIXTURES));
let nextId = 50;
const reply = (status, body) => { const wire = JSON.stringify(body); return Promise.resolve({ ok: status < 400, status, statusText: String(status), json: async () => JSON.parse(wire) }); };   // like a real response: a copy
const light = (t) => { const { admins, ...rest } = t; return rest; };
const stubFetch = async (url, options = {}) => {
  const path = String(url).replace(/^.*\/api\/v1/, '').split('?')[0];
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : {};
  const ok = (data) => reply(200, { success: true, data, meta: { page: 1, has_next: false }, request_id: 'x' });
  let m;
  if (path === '/tenants' && method === 'GET') return ok(server.map(light));
  if (path === '/tenants' && method === 'POST') {
    if (server.some((t) => t.slug === body.slug)) return reply(409, { success: false, error: { message: 'That slug is already taken' } });
    const id = nextId++;
    const tenant = { id, public_id: `TEN-NEW${id}`, ...body, status: 'ACTIVE', suspended_at: null, suspended_reason: null, created_at: new Date().toISOString(),
      usage: { users: 1, projects: 0, plots: 0, customers: 0, bookings: 0 } };
    delete tenant.admin;
    const admin = { id: id * 100, name: body.admin.name, email: body.admin.email, status: 'ACTIVE', must_change_password: true };
    tenant.admins = [admin];
    server.push(tenant);
    return reply(201, { success: true, data: { tenant: light(tenant), admin }, request_id: 'x' });
  }
  if ((m = path.match(/^\/tenants\/(\d+)$/))) {
    const t = server.find((x) => x.id === Number(m[1]));
    if (method === 'PATCH') Object.assign(t, body);
    return ok(method === 'GET' ? t : light(t));
  }
  if ((m = path.match(/^\/tenants\/(\d+)\/suspend$/))) { const t = server.find((x) => x.id === Number(m[1])); Object.assign(t, { status: 'SUSPENDED', suspended_reason: body.reason, suspended_at: new Date().toISOString() }); return ok(light(t)); }
  if ((m = path.match(/^\/tenants\/(\d+)\/activate$/))) { const t = server.find((x) => x.id === Number(m[1])); Object.assign(t, { status: 'ACTIVE', suspended_reason: null, suspended_at: null }); return ok(light(t)); }
  if ((m = path.match(/^\/tenants\/(\d+)\/admins$/))) {
    const t = server.find((x) => x.id === Number(m[1]));
    const admin = { id: Date.now(), name: body.name, email: body.email, status: 'ACTIVE', must_change_password: true };
    t.admins.push(admin); t.usage.users += 1;
    return reply(201, { success: true, data: { tenant: light(t), admin }, request_id: 'x' });
  }
  if (/^\/tenants\/\d+\/admins\/\d+\/reset-password$/.test(path)) return ok({ ok: true });
  return reply(404, { success: false, error: { message: `unexpected ${method} ${path}` } });
};

globalThis.fetch = stubFetch;

const failures = [];
const check = (condition, message) => { console.log(`  ${condition ? '✓' : '✗'} ${message}`); if (!condition) failures.push(message); };

const mount = async (role, route) => {
  const store = createStore();
  if (role === 'SUPER ADMIN') store.dispatch(sessionLoaded({ user: { name: 'Platform Owner', role: 'SUPER_ADMIN', email: 'owner@test' }, permissions: [] }));
  else store.dispatch(signedIn({ role, user: { name: `${role} Tester`, role, email: `${role}@test` } }));
  if (role === 'SUPER ADMIN') await act(async () => { await store.dispatch(hydrateWorkspace()); });   // same as sign-in
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(Provider, { store }, React.createElement(MemoryRouter, { initialEntries: [route] }, React.createElement(App))));
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });   // let the stand-in API answer
  return { store, host, unmount: () => act(async () => { root.unmount(); host.remove(); }) };
};

const text = (host) => host.textContent.replace(/\s+/g, ' ');
const byText = (host, selector, needle) => [...host.querySelectorAll(selector)].find((el) => el.textContent.includes(needle));
const click = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); });
const setValue = (el, value) => act(async () => {
  const proto = el instanceof window.HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new window.Event(el instanceof window.HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
});
const field = (host, labelText) => {
  const el = [...host.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(labelText))?.querySelector('input,select');
  if (!el) throw new Error(`form field not found: "${labelText}" (labels: ${[...host.querySelectorAll('label')].map((l) => l.textContent.trim().slice(0, 18)).join(' | ')})`);
  return el;
};
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });   // let the stand-in API answer
const submit = async (form) => { await act(async () => { form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); }); await settle(); };
const modal = (host) => host.querySelector('.modal-backdrop');

// ------------------------------------------------------------------ platform admin
console.log('platform admin');
let ui = await mount('SUPER ADMIN', '/tenants');
let page = text(ui.host);
check(page.includes('Tenant Management'), 'Tenants page renders for SUPER ADMIN');
check(['Lalita Realestate Infra', 'Skyline Realty', 'Horizon Developers'].every((n) => page.includes(n)), 'lists the seeded organisations');
const nav = [...ui.host.querySelectorAll('.sidebar nav .nav-item')].map((n) => n.textContent.trim());
check(nav.some((n) => n.startsWith('Overview')) && nav.some((n) => n.startsWith('Tenants')) && !nav.some((n) => /Bookings|Payments|Customers|Projects/.test(n)),
  `sidebar is platform-only (${nav.map((n) => n.replace(/\d+$/, '')).join(', ')})`);
check(!page.includes('Export CSV'), 'no business Export CSV button for the platform owner');

// invalid: duplicate slug
await click(byText(ui.host, 'button', 'Add Tenant'));
check(Boolean(modal(ui.host)) && text(ui.host).includes('First administrator'), 'Add Tenant opens the form with first-administrator section');
await setValue(field(ui.host, 'Organisation name'), 'Skyline Realty');
await setValue(field(ui.host, 'Workspace slug'), 'skyline');
await setValue(field(ui.host, 'Name *'), 'Dup Admin');
await setValue(field(ui.host, 'E-mail *'), 'dup@org.demo');
await submit(ui.host.querySelector('.modal'));
check(text(ui.host).includes('already taken'), 'duplicate slug is rejected with a message');
check(ui.store.getState().tenants.items.length === 3, 'nothing was created');

// invalid: bad admin e-mail, then valid create
await setValue(field(ui.host, 'Organisation name'), 'Test Org');
await setValue(field(ui.host, 'Workspace slug'), 'test-org');
await setValue(field(ui.host, 'E-mail *'), 'not-an-email');
await submit(ui.host.querySelector('.modal'));
check(text(ui.host).includes('Administrator e-mail is not valid'), 'invalid administrator e-mail is rejected');
await setValue(field(ui.host, 'E-mail *'), 'boss@testorg.demo');
await setValue(field(ui.host, 'Name *'), 'Test Boss');
await setValue(field(ui.host, 'Mobile *'), '9876543210');
await setValue(field(ui.host, 'User seats'), '5');
await submit(ui.host.querySelector('.modal'));
const created = ui.store.getState().tenants.items.find((t) => t.name === 'Test Org');
check(Boolean(created) && created.slug === 'test-org' && created.status === 'ACTIVE' && created.max_users === 5, 'tenant created (slug auto-derived, ACTIVE, 5 seats)');
check(created?.admins?.[0]?.email === 'boss@testorg.demo', 'first administrator provisioned');
check(!('credential' in ui.store.getState().tenants), 'no one-time password is kept in state');
check(!/One-time password|test43210/i.test(text(ui.host)), 'the starting password is not displayed anywhere');
check(!JSON.stringify(window.localStorage).includes('test43210'), 'the password is never written to storage');
check(text(ui.host).includes('Test Org'), 'new organisation appears in the table');

// edit + seat guard
const row = () => byText(ui.host, 'tbody tr', 'Test Org');
await click(row().querySelector('button[title="Edit organisation"]'));
check(!ui.host.querySelector('input[placeholder="auto from name"]'), 'slug is not editable once created');
await setValue(field(ui.host, 'Plan'), 'ENTERPRISE');
await setValue(field(ui.host, 'User seats'), '0');
await submit(ui.host.querySelector('.modal'));
check(text(ui.host).includes('Seat limit must be'), 'seat limit validated');
await setValue(field(ui.host, 'User seats'), '10');
await submit(ui.host.querySelector('.modal'));
const edited = ui.store.getState().tenants.items.find((t) => t.name === 'Test Org');
check(edited.plan === 'ENTERPRISE' && edited.max_users === 10, 'plan and seats updated');

// suspend / reactivate
await click(row().querySelector('button[title="Suspend access"]'));
await setValue(field(ui.host, 'Reason'), 'x');
await submit(ui.host.querySelector('.modal'));
check(text(ui.host).includes('at least 3 characters'), 'suspension requires a reason');
await setValue(field(ui.host, 'Reason'), 'Invoice unpaid');
await submit(ui.host.querySelector('.modal'));
let t = ui.store.getState().tenants.items.find((x) => x.name === 'Test Org');
check(t.status === 'SUSPENDED' && t.suspended_reason === 'Invoice unpaid', 'tenant suspended with reason');
await click(row().querySelector('button[title="Reactivate"]'));
t = ui.store.getState().tenants.items.find((x) => x.name === 'Test Org');
check(t.status === 'ACTIVE' && t.suspended_reason === null, 'tenant reactivated');

// detail: add administrator + reset password
await click(row().querySelector('button[title="View organisation"]'));
check(text(ui.host).includes('Administrators') && text(ui.host).includes('boss@testorg.demo'), 'detail lists administrators');
await setValue(field(ui.host, 'Name'), 'Second Admin');
await setValue(ui.host.querySelector('.modal input[type="email"]'), 'second@testorg.demo');
await setValue(field(ui.host, 'Mobile'), '9123456789');
await submit(ui.host.querySelector('.modal form'));
t = ui.store.getState().tenants.items.find((x) => x.name === 'Test Org');
check(t.admins.length === 2 && t.usage.users === 2, 'second administrator added (seat count updated)');
check(!/seco56789/i.test(text(ui.host)), 'the new administrator\'s starting password is not displayed');
await click(byText(ui.host, 'button', 'Reset password'));
await settle();
check(!/seco56789/i.test(text(ui.host)), 'reset does not display a password either');

// platform owner cannot reach business pages
await ui.unmount();
for (const route of ['/bookings', '/projects-plots', '/customers', '/payments', '/billing', '/reports', '/user-roles']) {
  ui = await mount('SUPER ADMIN', route);
  const html = text(ui.host);
  check(html.includes('Platform Console') || html.includes('ORGANISATIONS'), `${route} -> redirected to the platform overview`);
  await ui.unmount();
}

// pagination: 10 per page
ui = await mount('SUPER ADMIN', '/tenants');
await act(async () => {
  for (let i = 0; i < 12; i += 1) {
    ui.store.dispatch({ type: 'tenants/tenantUpserted', payload: {
      id: 100 + i, public_id: `TEN-X${i}`, name: `Bulk Org ${i}`, slug: `bulk-${i}`, status: 'ACTIVE', plan: 'STANDARD', max_users: 5,
      created_at: '2026-10-01T00:00:00Z', usage: { users: 1 }, admins: [] } });
  }
});
console.log(`  (store now holds ${ui.store.getState().tenants.items.length} organisations)`);
check(ui.host.querySelectorAll('tbody tr').length === 10, 'tenant table shows 10 rows per page');
check(text(ui.host).includes('Page 1 of 2'), 'pagination controls shown');
await click(ui.host.querySelector('button[aria-label="Next page"]'));
check(ui.host.querySelectorAll('tbody tr').length === 6 && text(ui.host).includes('Page 2 of 2'), 'page 2 shows the remaining 6 of 16 organisations (the new one persisted on the server)');
await ui.unmount();

// ------------------------------------------------------------ everyone else: no platform access
console.log('tenant staff');
for (const role of ['ADMIN', 'SALES MANAGER', 'SALES AGENT', 'ACCOUNTS', 'CUSTOMER']) {
  ui = await mount(role, '/tenants');
  const html = text(ui.host);
  check(!html.includes('Tenant Management') && !html.includes('Add Tenant'), `${role} cannot open /tenants`);
  const links = [...ui.host.querySelectorAll('.sidebar nav .nav-item')].map((n) => n.textContent);
  check(!links.some((l) => l.includes('Tenants')), `${role} has no Tenants menu item`);
  await ui.unmount();
}

rmSync(outDir, { recursive: true, force: true });
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\ntenant flow passed');
process.exit(failures.length ? 1 : 0);
