import React, { useEffect, useState } from 'react';
import { actions } from '../../api/resources';
import { PlotMap3D } from './PlotMap3D';

const REFRESH_MS = 60000;

/**
 * Public, view-only 3D plot map at /plot-map/<organisation>. No sign-in; the API sends only plot numbers,
 * their project and whether the plot is free — never prices, customers or agents.
 */
export function PublicPlotMap({ slug }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  useEffect(() => {
    let alive = true;
    const load = () => actions.publicPlotMap(slug)
      .then((r) => alive && setState({ loading: false, data: r.data, error: '' }))
      .catch((e) => alive && setState((prev) => ({ loading: false, data: prev.data, error: prev.data ? '' : (e.status === 404 ? 'This plot map is not available.' : 'Could not load the plot map. Please try again.') })));
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [slug]);

  useEffect(() => { if (state.data?.name) document.title = `${state.data.name} · Plot map`; }, [state.data?.name]);

  const { data } = state;
  return (
    <div className="public-plotmap">
      <header>
        <h1>{data?.label || 'Plot map'}</h1>
        <p>{data ? `${data.name} · Green = available · Amber = on hold · Red = booked` : ''}</p>
      </header>
      {state.loading && <p className="empty-note">Loading plot map…</p>}
      {state.error && <p className="empty-note" role="alert">{state.error}</p>}
      {data && (
        <PlotMap3D
          // The public feed marks a plot AVAILABLE or BOOKED; the map colour follows that.
          plots={(data.plots || []).map((p) => ({ number: p.number, status: p.status, project: p.project }))}
        />
      )}
    </div>
  );
}
