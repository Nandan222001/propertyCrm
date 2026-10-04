/**
 * Application bootstrap.
 *
 * Wires the Redux store and the router around the shell — the only file that
 * touches `document.getElementById`, so `App` stays testable in isolation.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';

import { App } from './app/App';
import { store } from './store';
import { ErrorBoundary } from './components/common/ErrorBoundary';

import './styles/base.css';
import './styles/role-theme.css';
import './styles/features.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </Provider>
  </React.StrictMode>,
);
