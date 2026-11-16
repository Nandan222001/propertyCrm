import React, { useMemo, useRef, useState } from 'react';
import { PLOT_MAPS } from '../../data/plotMaps';

const BOOKED_RED = '#e44350';
const FREE_GREEN = '#23ae65';

/**
 * View-only plot map. Each numbered plot on the layout drawing is green while it is available and red as
 * soon as it is booked (booked, on hold or sold — anything that is no longer free). Colours follow the
 * tenant's live plot inventory, matched by plot number.
 *
 * `plots` are the inventory rows ([number, …, status, …, project]).
 */
export function PlotMap({ mapKey, plots = [], project = 'All projects' }) {
  const map = PLOT_MAPS[mapKey];
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(null);
  const [chosen, setChosen] = useState('');
  const scroller = useRef(null);

  const numbers = useMemo(() => new Set((map?.points || []).map((p) => String(p[0]))), [map]);
  // Which project this drawing describes: the one picked in the header, else the one holding most of its plot numbers.
  const projects = useMemo(() => [...new Set(plots.map((p) => p[8]).filter(Boolean))], [plots]);
  const best = useMemo(() => {
    const score = (name) => plots.filter((p) => p[8] === name && numbers.has(String(p[0]))).length;
    return [...projects].sort((a, b) => score(b) - score(a))[0] || '';
  }, [plots, projects, numbers]);
  const active = chosen || (project !== 'All projects' && projects.includes(project) ? project : best);

  const statusOf = useMemo(() => {
    const lookup = new Map();
    plots.filter((p) => p[8] === active).forEach((p) => lookup.set(String(p[0]), p[5]));
    return lookup;
  }, [plots, active]);

  if (!map) return <p className="empty-note">No plot map is linked to your organisation.</p>;

  const [vw, vh] = map.viewBox;
  const known = map.points.filter((p) => statusOf.has(String(p[0])));
  const booked = known.filter((p) => statusOf.get(String(p[0])) !== 'AVAILABLE').length;
  const available = known.length - booked;
  const setZ = (z) => setZoom(Math.min(3, Math.max(0.55, z)));

  const find = () => {
    const hit = map.points.find((p) => String(p[0]) === query.trim());
    if (!hit) return setPicked(null);
    setPicked(hit[0]);
    const box = scroller.current;
    if (box) {
      box.scrollLeft = Math.max(0, (hit[1] / vw) * map.width * zoom - box.clientWidth / 2);
      box.scrollTop = Math.max(0, (hit[2] / vh) * map.height * zoom - box.clientHeight / 2);
    }
  };

  return (
    <div className="panel section-panel plotmap">
      <div className="plotmap-bar">
        <input
          value={query} inputMode="numeric" placeholder="Find plot no."
          onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && find()}
        />
        <button className="button button-white small-btn" onClick={find}>Find</button>
        <button className="button button-white small-btn" onClick={() => setZ(zoom / 1.25)} aria-label="Zoom out">−</button>
        <button className="button button-white small-btn" onClick={() => setZ(zoom * 1.25)} aria-label="Zoom in">+</button>
        {projects.length > 1 && (
          <select value={active} onChange={(e) => setChosen(e.target.value)} aria-label="Project">
            {projects.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        )}
        <span className="plotmap-legend">
          <i style={{ background: FREE_GREEN }} /> Available <b>{available}</b>
          <i style={{ background: BOOKED_RED }} /> Booked <b>{booked}</b>
        </span>
      </div>
      <div className="plotmap-scroll" ref={scroller}>
        <div className="plotmap-stage" style={{ width: map.width * zoom, height: map.height * zoom }}>
          <img src={map.image} alt={`${map.label} plot layout`} draggable="false" />
          <svg viewBox={`0 0 ${vw} ${vh}`} aria-label="Plot availability">
            {map.points.map(([id, x, y]) => {
              const status = statusOf.get(String(id));
              if (!status) return null;
              const free = status === 'AVAILABLE';
              return (
                <circle
                  key={id} cx={x} cy={y} r={id <= 30 ? 4.2 : 4.6}
                  fill={free ? FREE_GREEN : BOOKED_RED} fillOpacity={picked === id ? 0.95 : 0.6}
                  stroke={picked === id ? '#102b6c' : '#fff'} strokeWidth={picked === id ? 2 : 0.8}
                >
                  <title>{`Plot ${id} · ${free ? 'Available' : 'Booked'}`}</title>
                </circle>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
