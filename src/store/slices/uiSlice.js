/**
 * UI slice — every transient bit of shell state (navigation, filters, modals,
 * toasts). Components stop owning layout state, so the same filter value is
 * never tracked twice.
 */
import { createSlice } from '@reduxjs/toolkit';
import { PAGES } from '../../constants/navigation';

const initialState = {
  page: PAGES.OVERVIEW,
  mobileOpen: false,
  modal: '',
  toast: '',
  search: '',
  period: 'This month',
  project: 'All projects',
  tab: 'Plots',
  filter: 'All status',
  /** Row context handed to modals instead of duplicating state per page. */
  customerSelected: null,
  billNo: '',
  bookingPrint: null,
  bookingDocKind: 'Booking',
  agentInfo: null,
  bookingPreset: null,
  crudPage: PAGES.OVERVIEW,
  editRecord: null,
  userEdit: null,
  /** Pages that are still fetching their own data: { key: true } while loading. */
  loadingKeys: {},
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    loadingSet(state, action) {
      const { key, value } = action.payload;
      if (value) state.loadingKeys[key] = true; else delete state.loadingKeys[key];
    },
    pageChanged(state, action) {
      state.page = action.payload;
      state.search = '';
      state.mobileOpen = false;
      // customerSelected is deliberately kept here: the URL sync can fire a transient pageChanged for the old
      // route right after a profile is opened, and clearing it then showed the first customer instead.
      if (action.payload === PAGES.PROJECTS) state.tab = 'Projects';
      if (action.payload === PAGES.BOOKINGS) state.tab = 'All bookings';
    },
    sidebarToggled(state, action) {
      state.mobileOpen = action.payload ?? !state.mobileOpen;
    },
    modalOpened(state, action) {
      const { modal, preset = null, crudPage, editRecord = null, userEdit = null } = action.payload || {};
      state.modal = modal;
      state.bookingPreset = preset;
      if (crudPage !== undefined) state.crudPage = crudPage;
      state.editRecord = editRecord;
      state.userEdit = userEdit;
    },
    modalClosed(state) {
      state.modal = '';
      state.bookingPreset = null;
      state.editRecord = null;
      state.userEdit = null;
    },
    toastPushed(state, action) {
      state.toast = action.payload;
    },
    toastCleared(state) {
      state.toast = '';
    },
    searchChanged(state, action) {
      state.search = action.payload;
    },
    periodChanged(state, action) {
      state.period = action.payload;
    },
    projectChanged(state, action) {
      state.project = action.payload;
    },
    tabChanged(state, action) {
      state.tab = action.payload;
    },
    filterChanged(state, action) {
      state.filter = action.payload;
    },
    customerSelected(state, action) {
      state.customerSelected = action.payload;
    },
    billOpened(state, action) {
      state.billNo = action.payload || '';
    },
    bookingPrintSet(state, action) {
      // Accepts a booking id (booking form) or { id, kind } for allotment / agreement.
      const payload = action.payload;
      const id = payload && typeof payload === 'object' ? payload.id : payload;
      state.bookingPrint = id || null;
      state.bookingDocKind = (payload && payload.kind) || 'Booking';
    },
    agentInfoSet(state, action) {
      state.agentInfo = action.payload || null;
    },
  },
  extraReducers: (builder) => {
    // A new session never inherits the previous user's open profile.
    const clearSelection = (state) => { state.customerSelected = null; };
    builder.addCase('auth/signedOut', clearSelection).addCase('auth/signedIn', clearSelection);
  },
});

export const {
  pageChanged, sidebarToggled, modalOpened, modalClosed, toastPushed, toastCleared,
  searchChanged, periodChanged, projectChanged, tabChanged, filterChanged,
  customerSelected, billOpened, bookingPrintSet, agentInfoSet, loadingSet,
} = uiSlice.actions;
export default uiSlice.reducer;
