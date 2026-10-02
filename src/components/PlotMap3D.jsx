import React, { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';

// Interactive 3D layout map built from CSS 3D transforms (no extra library).
// Each plot is an extruded block; height and colour show its status.
const TILE = 50;
const GAP = 10;
const COLS = 8;
const HEIGHT = { AVAILABLE: 8, HOLD: 18, BOOKED: 28, SOLD: 40 };
const COLOR = { AVAILABLE: '#34c38f', HOLD: '#f1b44c', BOOKED: '#5566dc', SOLD: '#8a94a6' };

function Block({ plot, x, y, active, onSelect, hideNames }) {
  const status = plot[5];
  const h = HEIGHT[status] ?? 8;
  const c = COLOR[status] ?? '#8a94a6';
  const lift = active ? 12 : 0;
  const style = { left: x, top: y, width: TILE, height: TILE, '--h': `${h + lift}px`, '--c': c };
  return (
    <div className={`blk ${active ? 'active' : ''}`} style={style} onClick={() => onSelect(plot)} title={`${plot[0]} · ${status}`}>
      <i className="f top"><span>{plot[0].replace('-', '')}</span></i>
      <i className="f south" /><i className="f north" /><i className="f east" /><i className="f west" />
    </div>
  );
}

export function PlotMap3D({ plots, role, notify, onBook }) {
  const [tilt, setTilt] = useState(52);
  const [spin, setSpin] = useState(-32);
  const [zoom, setZoom] = useState(1);
  const [pick, setPick] = useState(null);

  const rows = Math.max(1, Math.ceil(plots.length / COLS));
  const w = COLS * (TILE + GAP);
  const h = rows * (TILE + GAP);
  const customerView = role === 'CUSTOMER';
  const active = plots.find(p => p[0] === pick) || null;

  const counts = useMemo(() => {
    const c = { AVAILABLE: 0, HOLD: 0, BOOKED: 0, SOLD: 0 };
    plots.forEach(p => { if (c[p[5]] !== undefined) c[p[5]]++; });
    return c;
  }, [plots]);

  const reset = () => { setTilt(52); setSpin(-32); setZoom(1); };

  return (
    <div className="map3d">
      <div className="map3d-controls no-print">
        <label>Tilt <input type="range" min="0" max="75" value={tilt} onChange={e => setTilt(+e.target.value)} /></label>
        <label>Rotate <input type="range" min="-90" max="90" value={spin} onChange={e => setSpin(+e.target.value)} /></label>
        <label>Zoom <input type="range" min="0.6" max="1.6" step="0.05" value={zoom} onChange={e => setZoom(+e.target.value)} /></label>
        <button className="button button-white small-btn" onClick={reset}><RotateCcw size={12} /> Reset</button>
        <div className="map3d-legend">
          {Object.entries(COLOR).map(([k, v]) => <span key={k}><i style={{ background: v }} />{k} ({counts[k]})</span>)}
        </div>
      </div>

      <div className="map3d-stage">
        <div className="map3d-scene" style={{ width: w, height: h, transform: `scale(${zoom}) rotateX(${tilt}deg) rotateZ(${spin}deg)` }}>
          <div className="map3d-ground" />
          {plots.map((p, i) => (
            <Block
              key={p[0]}
              plot={p}
              x={(i % COLS) * (TILE + GAP) + GAP / 2}
              y={Math.floor(i / COLS) * (TILE + GAP) + GAP / 2}
              active={p[0] === pick}
              onSelect={pl => setPick(pl[0])}
            />
          ))}
        </div>
        {plots.length === 0 && <p className="map3d-empty">No plots match the current filters.</p>}
      </div>

      <div className="map3d-detail">
        {active ? (
          <>
            <div>
              <small>PLOT</small>
              <b>{active[0]}</b>
              <span className="map3d-dot" style={{ background: COLOR[active[5]] }} /> {active[5]}
            </div>
            <div><small>PROJECT · LAYOUT</small><b>{active[8]}</b> {active[1]}</div>
            <div><small>AREA · FACING</small><b>{active[2]} sq.ft</b> {active[3]}</div>
            <div><small>PRICE</small><b>₹{active[4]}</b></div>
            {!customerView && <div><small>CUSTOMER · AGENT</small><b>{active[6]}</b> {active[7]}</div>}
            {active[5] === 'AVAILABLE' && onBook && (
              <button className="button button-primary small-btn" onClick={() => onBook(active)}>
                {role === 'SALES AGENT' ? 'Book this plot' : 'Create booking'}
              </button>
            )}
          </>
        ) : (
          <p>Click a plot block to see its details. Drag the sliders to tilt, rotate and zoom the layout.</p>
        )}
      </div>
    </div>
  );
}
