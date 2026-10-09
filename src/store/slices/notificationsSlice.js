/**
 * Notifications slice — the signed-in user's own queue.
 *
 * Live mode loads `/notifications`, which the server already scopes to this user's
 * role / person / customer record, so the SPA never filters other people's alerts
 * client-side. Offline (demo) mode derives a role-specific sample list instead.
 */
import { createSlice } from '@reduxjs/toolkit';
import { signedOut } from './authSlice';

const slice = createSlice({
  name: 'notifications',
  initialState: { items: [], loaded: false },
  reducers: {
    notificationsLoaded(state, action) {
      state.items = action.payload;
      state.loaded = true;
    },
    notificationPatched(state, action) {
      const { id, changes } = action.payload;
      state.items = state.items.map((n) => (n.id === id ? { ...n, ...changes } : n));
    },
  },
  extraReducers: (builder) => {
    builder.addCase(signedOut, () => ({ items: [], loaded: false }));
  },
});

export const { notificationsLoaded, notificationPatched } = slice.actions;
export default slice.reducer;
