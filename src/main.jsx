/**
 * Application bootstrap.
 *
 * Wires the Redux store and the router around the shell — the only file that
 * touches `document.getElementById`, so `App` stays testable in isolation.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter, useLocation } from 'react-router-dom';

import { App } from './app/App';
import { store } from './store';
import { PublicPlotMap } from './features/plotmap/PublicPlotMap';
import { ErrorBoundary } from './components/common/ErrorBoundary';

import './styles/base.css';
import './styles/role-theme.css';
import './styles/features.css';

/** /plot-map/<organisation> is public: it renders without the sign-in gate (and without touching a session). */
function Root() {
  const { pathname } = useLocation();
  const match = pathname.match(/^\/plot-map\/([a-z0-9-]+)\/?$/i);
  return match ? <PublicPlotMap slug={match[1]} /> : <App />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <ErrorBoundary>
        <BrowserRouter>
          <Root />
        </BrowserRouter>
      </ErrorBoundary>
    </Provider>
  </React.StrictMode>,
);
