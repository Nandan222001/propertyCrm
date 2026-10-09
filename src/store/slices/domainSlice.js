/**
 * Domain slice — the ERP master data (projects, plots, bookings, collections,
 * receipts, customers, registry, module CRUD rows, follow-ups).
 *
 * One set of generic reducers serves every collection: adding a new entity is a
 * key + an id accessor, never another copy of the same upsert/remove logic.
 */
import { createSlice } from '@reduxjs/toolkit';
import {
  projects as seedProjects, seedPlots, seedBookings, seedPays, seedReceipts, seedInvoices,
  seedCustomers, seedRegistry, seedCrud,
} from '../../data/seedData';
import { readJson } from '../../utils/storage';
import { signedOut } from './authSlice';
import { nowIso } from '../../utils/date';

/** Resolve a row's identity across the tuple-shaped and object-shaped seeds. */
export const identityOf = (key, row) => {
  if (Array.isArray(row)) return row[0];
  if (key === 'customers') return row.id;
  return row.id ?? row.no ?? row.key;
};

const withCrudIds = (saved) => Object.fromEntries(
  Object.entries(saved).map(([key, rows]) => [key, rows.map((row, i) => ({ ...row, id: row.id || `${key}-${i + 1}` }))]),
);

const saved = readJson('collections', null) || {};

/** Collections that hold a tenant's business data (cleared on sign-out / failed load in live mode). */
const LIVE_COLLECTIONS = ['projects', 'plots', 'bookings', 'payments', 'receipts', 'invoices', 'customers'];

const initialState = {
  projects: saved.projects || seedProjects,
  plots: saved.plots || seedPlots,
  bookings: saved.bookings || seedBookings,
  payments: saved.payments || seedPays,
  receipts: saved.receipts || seedReceipts,
  invoices: saved.invoices || seedInvoices,
  customers: saved.customers || seedCustomers,
  registry: saved.registry || seedRegistry,
  crud: withCrudIds(readJson('crud', null) || seedCrud),
  followUps: readJson('follow_ups', null) || {},
  /** 'demo' until the API answers; 'live' once the workspace is hydrated. */
  mode: 'demo',
  status: 'idle',
  error: '',
};

const domainSlice = createSlice({
  name: 'domain',
  initialState,
  extraReducers: (builder) => {
    builder.addCase(signedOut, (state) => {
      if (state.mode !== 'live') return;
      LIVE_COLLECTIONS.forEach((key) => { state[key] = []; });
      state.registry = {};
    });
  },
  reducers: {
    /** Replace a whole collection (API hydration or seed reset). */
    collectionReplaced(state, action) {
      const { key, rows } = action.payload;
      if (key in state) state[key] = rows;
    },
    workspaceHydrated(state, action) {
      const payload = action.payload || {};
      // Authoritative: a tenant with no bookings gets an EMPTY list, never the demo dataset.
      Object.entries(payload).forEach(([key, rows]) => {
        if (key in state && Array.isArray(rows)) state[key] = rows;
      });
      state.registry = {};
      state.mode = 'live';
      state.status = 'ready';
      state.error = '';
    },
    /** Live sign-in whose data could not be loaded: empty collections, never demo records. */
    workspaceFailed(state, action) {
      LIVE_COLLECTIONS.forEach((key) => { state[key] = []; });
      state.registry = {};
      state.mode = 'live';
      state.status = 'error';
      state.error = action.payload || 'Workspace data unavailable';
    },
    workspaceDemo(state, action) {
      state.mode = 'demo';
      state.status = 'ready';
      state.error = action.payload || '';
    },
    workspaceLoading(state) {
      state.status = 'loading';
    },
    /** Insert or replace one row, matching on the collection identity. */
    rowUpserted(state, action) {
      const { key, row, mode = 'prepend' } = action.payload;
      const rows = state[key] || [];
      const id = identityOf(key, row);
      const index = rows.findIndex((existing) => identityOf(key, existing) === id);
      if (index >= 0) rows[index] = row;
      else if (mode === 'append') rows.push(row);
      else rows.unshift(row);
      state[key] = rows;
    },
    rowPatched(state, action) {
      const { key, id, changes } = action.payload;
      state[key] = (state[key] || []).map((row) => {
        if (identityOf(key, row) !== id) return row;
        return Array.isArray(row)
          ? row.map((value, i) => (i in changes ? changes[i] : value))
          : { ...row, ...changes };
      });
    },
    /**
     * Insert or update a project. Plots, bookings, payments, receipts and invoices
     * reference a project by name, so a rename is cascaded to keep them attached.
     */
    projectSaved(state, action) {
      const { previousName, row } = action.payload;
      const index = state.projects.findIndex((p) => p[0] === (previousName ?? row[0]));
      if (index >= 0) state.projects[index] = row;
      else state.projects.unshift(row);
      if (previousName && previousName !== row[0]) {
        const next = row[0];
        state.plots = state.plots.map((r) => (r[8] === previousName ? r.map((v, i) => (i === 8 ? next : v)) : r));
        state.bookings = state.bookings.map((r) => (r[2] === previousName ? r.map((v, i) => (i === 2 ? next : v)) : r));
        state.payments = state.payments.map((r) => (r[2] === previousName ? r.map((v, i) => (i === 2 ? next : v)) : r));
        state.receipts = state.receipts.map((r) => (r.project === previousName ? { ...r, project: next } : r));
        state.invoices = state.invoices.map((r) => (r.project_name === previousName ? { ...r, project_name: next } : r));
      }
    },
    /** Ledger rows are keyed by customer name, so match on customer + plot. */
    paymentStatusSet(state, action) {
      const { customer, plot, status } = action.payload;
      state.payments = (state.payments || []).map((row) => (
        row[0] === customer && row[1] === plot ? row.map((value, i) => (i === 7 ? status : value)) : row
      ));
    },
    rowRemoved(state, action) {
      const { key, id } = action.payload;
      state[key] = (state[key] || []).filter((row) => identityOf(key, row) !== id);
    },
    registryStatusSet(state, action) {
      const { id, value } = action.payload;
      state.registry = { ...state.registry, [id]: value };
    },
    followUpSet(state, action) {
      const { id, value } = action.payload;
      state.followUps = { ...state.followUps, [id]: value };
    },
    /** Module CRUD (projects/agents masters) — scoped per page key. */
    crudRowUpserted(state, action) {
      const { key, row } = action.payload;
      const rows = state.crud[key] || [];
      const index = row.id ? rows.findIndex((r) => r.id === row.id) : -1;
      const stamped = { ...row, updatedAt: nowIso() };
      if (index >= 0) rows[index] = { ...rows[index], ...stamped };
      else rows.unshift({ ...stamped, id: row.id || `row-${Date.now()}`, createdAt: nowIso() });
      state.crud = { ...state.crud, [key]: rows };
    },
    crudRowRemoved(state, action) {
      const { key, id } = action.payload;
      state.crud = { ...state.crud, [key]: (state.crud[key] || []).filter((r) => r.id !== id) };
    },
    domainError(state, action) {
      state.error = action.payload || 'Something went wrong';
    },
  },
});

export const {
  collectionReplaced, workspaceHydrated, workspaceDemo, workspaceLoading,
  rowUpserted, rowPatched, rowRemoved, projectSaved, paymentStatusSet, registryStatusSet, followUpSet,
  crudRowUpserted, crudRowRemoved, domainError, workspaceFailed,
} = domainSlice.actions;
export default domainSlice.reducer;
