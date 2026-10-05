/**
 * Client smoke test — renders the real App tree in jsdom.
 *
 * Guards the restructure: every screen must render without throwing for the
 * signed-out state and for each staff role, using the bundled production code
 * path (esbuild), so an undefined import or a bad selector fails CI.
 *
 *   node scripts/render-smoke.mjs
 */
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROLES = ['SUPER ADMIN', 'ADMIN', 'SALES MANAGER', 'SALES AGENT', 'ACCOUNTS', 'MANAGEMENT', 'CUSTOMER'];

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

const GLOBALS = [
  'window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage',
];
for (const key of GLOBALS) {
  if (dom.window[key] === undefined) continue;
  Object.defineProperty(globalThis, key, { value: dom.window[key], writable: true, configurable: true });
}
// jsdom's navigator/clipboard are getter-only on the global object; defineValue them.
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.URL = dom.window.URL;
globalThis.Blob = dom.window.Blob;
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

// Bundle inside node_modules/.cache so bare imports (react, redux) resolve.
const outDir = path.join(process.cwd(), 'node_modules', '.cache', 'render-smoke');
mkdirSync(outDir, { recursive: true });
const outfile = path.join(outDir, 'app.mjs');

await build({
  entryPoints: ['scripts/smoke-entry.jsx'],
  bundle: true,
  format: 'esm',
  outfile,
  platform: 'browser',
  jsx: 'automatic',
  loader: { '.js': 'jsx', '.jsx': 'jsx' },
  external: ['react', 'react-dom', 'react-dom/server', 'react-redux', 'react-router-dom', '@reduxjs/toolkit', 'lucide-react'],
  define: { 'import.meta.env': '{}' },
  logLevel: 'error',
});

const React = (await import('react')).default;
const { renderToString } = await import('react-dom/server');
const { Provider } = await import('react-redux');
const { MemoryRouter } = await import('react-router-dom');

const { App, createStore, signedIn } = await import(pathToFileURL(outfile).href);

const failures = [];
const render = (store, route = '/') => renderToString(
  React.createElement(Provider, { store },
    React.createElement(MemoryRouter, { initialEntries: [route] }, React.createElement(App))),
);

// 1. Signed out -> the login screen must render.
try {
  const html = render(createStore());
  if (!/Lalita|Sign in|Login/i.test(html)) failures.push('signed-out screen rendered unexpected markup');
  console.log('  ✓ signed-out login screen');
} catch (error) {
  failures.push(`signed-out render threw: ${error.message}`);
}

// 2. Every role -> shell + overview dashboard must render.
for (const role of ROLES) {
  try {
    const store = createStore();
    store.dispatch(signedIn({ role, user: { name: `${role} Tester`, role, email: `${role}@test` } }));
    const html = render(store, '/');
    if (!html.includes('Lalita') && !html.includes('Workspace')) failures.push(`${role}: shell markup missing`);
    console.log(`  ✓ ${role} workspace`);
  } catch (error) {
    failures.push(`${role} render threw: ${error.message}`);
  }
}

// 3. Deep links on the heavier pages.
for (const [role, route] of [['ADMIN', '/bookings'], ['ACCOUNTS', '/payments'], ['ADMIN', '/projects-plots'], ['SUPER ADMIN', '/user-roles'], ['CUSTOMER', '/documents']]) {
  try {
    const store = createStore();
    store.dispatch(signedIn({ role, user: { name: `${role} Tester`, role } }));
    render(store, route);
    console.log(`  ✓ ${role} ${route}`);
  } catch (error) {
    failures.push(`${role} ${route} render threw: ${error.message}`);
  }
}

rmSync(outDir, { recursive: true, force: true });

if (failures.length) {
  console.error('\nrender smoke failed:');
  failures.forEach((failure) => console.error(`  ✗ ${failure}`));
  process.exit(1);
}
console.log('\nrender smoke passed');
