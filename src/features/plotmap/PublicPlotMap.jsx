import React, { useEffect, useState } from 'react';
import { actions } from '../../api/resources';
import { PlotMap } from './PlotMap';
import { PLOT_MAPS } from '../../data/plotMaps';

const REFRESH_MS = 60000;

/** Public, view-only plot map at /plot-map/<organisation>. No sign-in; shows only free (green) and booked (red). */
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
        <h1>{data ? (PLOT_MAPS[data.map]?.label || data.label) : 'Plot map'}</h1>
        <p>{data ? `${PLOT_MAPS[data.map]?.subtitle || data.name} · Green = available · Red = booked` : ''}</p>
      </header>
      {state.loading && <p className="empty-note">Loading plot map…</p>}
      {state.error && <p className="empty-note" role="alert">{state.error}</p>}
      {data && <PlotMap mapKey={data.map} plots={data.plots} />}
    </div>
  );
}
