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
  agentInfo: null,
  bookingPreset: null,
  crudPage: PAGES.OVERVIEW,
  editRecord: null,
  userEdit: null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    pageChanged(state, action) {
      state.page = action.payload;
      state.search = '';
      state.mobileOpen = false;
      if (action.payload !== PAGES.CUSTOMER_DETAIL) state.customerSelected = null;
      if (action.payload === PAGES.PROJECTS) state.tab = 'Plots';
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
      state.bookingPrint = action.payload || null;
    },
    agentInfoSet(state, action) {
      state.agentInfo = action.payload || null;
    },
  },
});

export const {
  pageChanged, sidebarToggled, modalOpened, modalClosed, toastPushed, toastCleared,
  searchChanged, periodChanged, projectChanged, tabChanged, filterChanged,
  customerSelected, billOpened, bookingPrintSet, agentInfoSet,
} = uiSlice.actions;
export default uiSlice.reducer;
