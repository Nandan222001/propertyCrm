import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLOT_LAYOUT, PLOT_MAP_OUTLINE } from '../../data/plotLayout';
import { PLOT_MAP_LABELS } from '../../data/plotRoads';
import { plotMapKey } from '../../utils/plotNumber';

/**
 * Interactive flat (2D, top-down) plot map of the colony layout.
 *
 * Every plot of the drawing is coloured from the tenant's live plot inventory: green while it is available,
 * amber while it is on hold, red once it is booked or sold. Plots are matched on the digits of their number
 * alone (`plotMapKey`), so a plot entered as "COMM-01" lights up plot 1 of the map.
 *
 * `plots` are the domain rows the app already holds: `{ number, status, project }` (index into the app's plot
 * array in `App.jsx`, so `[0]` number, `[5]` status, `[8]` project).
 */

const STATUS = {
  AVAILABLE: { label: 'Available', hex: 0x1e9e3a, css: '#1e9e3a' },
  HOLD: { label: 'On hold', hex: 0xf5a623, css: '#f5a623' },
  BOOKED: { label: 'Booked', hex: 0xd62828, css: '#d62828' },
  SOLD: { label: 'Sold', hex: 0x8e1b1b, css: '#8e1b1b' },
  COMPANY_HOLD: { label: 'Company hold', hex: 0x7c3aed, css: '#7c3aed' },
};
const UNLISTED = { label: 'Not in the ERP', hex: 0xc3ccd6, css: '#c3ccd6' };

const statusOf = (value) => (STATUS[String(value || '').toUpperCase()] ? String(value).toUpperCase() : null);

/** A canvas texture holding a plot's number. */
function numberTexture(text, tone) {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = tone;
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text), canvas.width / 2, canvas.height / 2 + 2);
  return new THREE.CanvasTexture(canvas);
}

/** A road width (red) or khesara number (green) as a texture, plus the shape of the text so it is not stretched. */
const ROAD_TEXT = { road: { color: '#a3203f', weight: '700', height: 8 }, khesara: { color: '#2e7d4f', weight: '600', height: 5.5 } };
function roadTexture(text, kind) {
  const { color, weight } = ROAD_TEXT[kind];
  const size = 64;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 24;
  canvas.height = size + 20;
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;      // resizing the canvas resets the context
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  return { texture: new THREE.CanvasTexture(canvas), aspect: canvas.width / canvas.height };
}

export function PlotMap3D({ plots = [], project = 'All projects' }) {
  const mount = useRef(null);
  const sceneRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [legend, setLegend] = useState([]);

  /* ---------------------------------------------------------------- the inventory, keyed by map plot number */
  const projects = useMemo(() => [...new Set(plots.map((p) => p.project).filter(Boolean))], [plots]);
  const [chosen, setChosen] = useState('');
  const best = useMemo(() => {
    const known = new Set(PLOT_LAYOUT.map((p) => String(p.no)));
    const score = (name) => plots.filter((p) => p.project === name && known.has(plotMapKey(p.number))).length;
    return [...projects].sort((a, b) => score(b) - score(a))[0] || '';
  }, [plots, projects]);
  const active = chosen || (project !== 'All projects' && projects.includes(project) ? project : best);

  const lookup = useMemo(() => {
    const map = new Map();
    plots.filter((p) => p.project === active).forEach((p) => {
      const key = plotMapKey(p.number);
      const state = statusOf(p.status);
      if (!key || !state) return;
      // A booked plot wins over an available one when two numbers map to the same drawing plot.
      if (!map.has(key) || map.get(key) === 'AVAILABLE') map.set(key, state);
    });
    return map;
  }, [plots, active]);

  /* ------------------------------------------------------------------------------- build the three.js scene */
  useEffect(() => {
    let cleanup = () => {};
    setError('');
    mount.current.innerHTML = '';
    try {
      const host = mount.current;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xeef1f5);
      const centre = new THREE.Vector3(520, 0, 420);
      const HALF_H = 470;   // world units visible above/below the centre at zoom 1
      const camera = new THREE.OrthographicCamera(-HALF_H, HALF_H, HALF_H, -HALF_H, 1, 4000);
      camera.up.set(0, 0, -1);   // flat plan view: screen-up is -z, as on the drawing
      camera.position.set(centre.x, 1500, centre.z);
      camera.lookAt(centre);

      const controls = new OrbitControls(camera, renderer.domElement);
      if (controls) {
        controls.target.copy(centre);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enableRotate = false;   // 2D: drag pans, scroll / pinch zooms
        controls.screenSpacePanning = true;
        controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
        controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
        controls.minZoom = 0.6;
        controls.maxZoom = 10;
        controls.update();
      }

      scene.add(new THREE.AmbientLight(0xffffff, 0.82));
      const sun = new THREE.DirectionalLight(0xffffff, 0.55);
      sun.position.set(400, 900, 300);
      scene.add(sun);

      const slab = (x, y, z, w, h, d, color, opacity = 1) => {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity }),
        );
        mesh.position.set(x, y, z);
        return mesh;
      };

      const plots3d = [];
      PLOT_LAYOUT.forEach((plot) => {
        const mesh = slab(plot.x, 0.5, plot.z, plot.w - 1.4, 1, plot.d - 1.4, UNLISTED.hex);
        mesh.userData = { ...plot, state: null };
        scene.add(mesh);

        const size = Math.min(plot.w - 3, (plot.d - 3) * 2);
        const label = new THREE.Mesh(
          new THREE.PlaneGeometry(size, size / 2),
          new THREE.MeshBasicMaterial({ transparent: true }),
        );
        label.rotation.x = -Math.PI / 2;
        label.position.set(plot.x, 1.2, plot.z);
        scene.add(label);
        plots3d.push({ mesh, label, tone: null });
      });

      // The colony boundary: the blue line of the drawing, drawn as a flat ribbon with rounded corners.
      const BOUNDARY = 3.2;                                             // ribbon width, in feet
      const boundaryMaterial = new THREE.MeshBasicMaterial({ color: 0x1b3a8f });
      const boundary = PLOT_MAP_OUTLINE.map(([x, z]) => [x, -z]);       // the outline is stored with z flipped
      const boundaryMeshes = [];
      boundary.forEach(([x1, z1], i) => {
        const [x2, z2] = boundary[(i + 1) % boundary.length];
        const length = Math.hypot(x2 - x1, z2 - z1);
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(length, BOUNDARY), boundaryMaterial);
        strip.rotation.set(-Math.PI / 2, 0, Math.atan2(-(z2 - z1), x2 - x1));
        strip.position.set((x1 + x2) / 2, 0.2, (z1 + z2) / 2);
        const joint = new THREE.Mesh(new THREE.CircleGeometry(BOUNDARY / 2, 12), boundaryMaterial);
        joint.rotation.x = -Math.PI / 2;
        joint.position.set(x1, 0.2, z1);
        scene.add(strip, joint);
        boundaryMeshes.push(strip, joint);
      });

      // Road details: the width of each road (red) and the khesara numbers (green), where they are on the drawing.
      const roadLabels = PLOT_MAP_LABELS.map((item) => {
        const { texture, aspect } = roadTexture(item.text, item.kind);
        const height = ROAD_TEXT[item.kind].height * (84 / 64);          // the canvas is a little taller than the text
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(height * aspect, height),
          new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
        );
        // Flat on the map; vertical roads read bottom to top. Khesara numbers sit just above the plots they cross.
        mesh.rotation.set(-Math.PI / 2, 0, (item.angle * Math.PI) / 180);
        mesh.position.set(item.x, item.kind === 'khesara' ? 1.4 : 0.4, item.z);
        mesh.renderOrder = item.kind === 'khesara' ? 3 : 2;
        scene.add(mesh);
        return mesh;
      });

      const resize = () => {
        const width = host.clientWidth || 800;
        const height = host.clientHeight || 520;
        renderer.setSize(width, height, false);
        const half = HALF_H * (width / height);
        camera.left = -half; camera.right = half; camera.top = HALF_H; camera.bottom = -HALF_H;
        camera.updateProjectionMatrix();
      };
      resize();
      const observer = window.ResizeObserver ? new ResizeObserver(resize) : null;
      if (observer) observer.observe(host); else window.addEventListener('resize', resize);

      sceneRef.current = {};  // paint() below fills it in once the meshes exist

      // Hover + click picking.
      const ray = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const canvas = renderer.domElement;
      const pickAt = (event) => {
        const box = canvas.getBoundingClientRect();
        pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
        ray.setFromCamera(pointer, camera);
        const hit = ray.intersectObjects(plots3d.map((row) => row.mesh), false)[0];
        const row = hit ? plots3d.find((candidate) => candidate.mesh === hit.object) : null;
        return row ? row.mesh.userData : null;
      };
      const onClick = (event) => {
        const found = pickAt(event);
        setPicked(found ? { no: found.no, state: found.state, area: found.area, dim: found.dim } : null);
      };
      canvas.addEventListener('click', onClick);

      let frame = 0;
      const tick = () => {
        if (controls) controls.update();
        renderer.render(scene, camera);
        frame = requestAnimationFrame(tick);
      };
      if (!reduced) tick(); else renderer.render(scene, camera);

      /** Colour the map from a number -> status lookup, and dim whatever does not pass ``only``. */
      const paint = (states, only) => {
        plots3d.forEach((row) => {
          const { no } = row.mesh.userData;
          const state = states.get(String(no)) || null;
          const meta = state ? STATUS[state] : UNLISTED;
          row.mesh.material.color.setHex(meta.hex);
          row.mesh.userData.state = state;
          if (row.tone !== (state ? '#ffffff' : '#334155')) {
            row.tone = state ? '#ffffff' : '#334155';
            row.label.material.map?.dispose();
            row.label.material.map = numberTexture(no, row.tone);
            row.label.material.needsUpdate = true;
          }
          const shown = !only || only === 'ALL' || state === only;
          row.mesh.material.opacity = shown ? 1 : 0.12;
          row.mesh.material.transparent = !shown;
          row.label.visible = shown;
        });
        setLegend(plots3d.map((row) => ({ no: row.mesh.userData.no, state: row.mesh.userData.state })));
      };

      sceneRef.current = {
        ...sceneRef.current,
        paint,
        focus: (no) => {
          const target = plots3d.find((row) => String(row.mesh.userData.no) === String(no))?.mesh.userData;
          if (!target) return;
          controls?.target.set(target.x, 0, target.z);
          camera.position.set(target.x, 1500, target.z);
          camera.zoom = 4;
          camera.updateProjectionMatrix();
          controls?.update();
          if (reduced) renderer.render(scene, camera);
        },
        reset: () => {
          controls?.target.copy(centre);
          camera.position.set(centre.x, 1500, centre.z);
          camera.zoom = 1;
          camera.updateProjectionMatrix();
          controls?.update();
          if (reduced) renderer.render(scene, camera);
        },
      };
      setReady(true);
      paint(new Map(), 'ALL');

      cleanup = () => {
        cancelAnimationFrame(frame);
        canvas.removeEventListener('click', onClick);
        observer?.disconnect();
        window.removeEventListener('resize', resize);
        controls?.dispose();
        boundaryMeshes.forEach((mesh) => mesh.geometry.dispose());
        boundaryMaterial.dispose();
        roadLabels.forEach((mesh) => {
          mesh.geometry.dispose();
          mesh.material.map?.dispose();
          mesh.material.dispose();
        });
        plots3d.forEach((row) => {
          row.mesh.geometry.dispose();
          row.mesh.material.dispose();
          row.label.geometry.dispose();
          row.label.material.map?.dispose();
          row.label.material.dispose();
        });
        renderer.dispose();
        host.innerHTML = '';
        sceneRef.current = null;
      };
    } catch (problem) {
      setError(problem.message || 'Could not draw the plot map.');
    }

    return () => cleanup();
  }, []);

  // Repaint whenever the organisation's inventory (or the toolbar filter) changes.
  useEffect(() => {
    if (!ready) return;
    sceneRef.current?.paint(lookup, filter);
    setPicked((current) => (current ? { ...current, state: lookup.get(String(current.no)) || null } : current));
  }, [lookup, filter, ready]);

  /* ------------------------------------------------------------------------------------------------ toolbox */
  const counts = useMemo(() => {
    const totals = { AVAILABLE: 0, HOLD: 0, BOOKED: 0, SOLD: 0, COMPANY_HOLD: 0, unlisted: 0 };
    legend.forEach((row) => { if (row.state) totals[row.state] += 1; else totals.unlisted += 1; });
    return totals;
  }, [legend]);

  const find = useCallback((value) => {
    const key = plotMapKey(value);
    if (!key) return;
    const target = PLOT_LAYOUT.find((p) => String(p.no) === key);
    setPicked(target ? { no: target.no, ...target, state: lookup.get(String(target.no)) || null } : null);
    if (target) sceneRef.current?.focus(target.no);
  }, [lookup]);

  const shown = picked
    ? { ...picked, status: STATUS[picked.state] || UNLISTED }
    : null;

  return (
    <div className="panel section-panel plotmap">
      <div className="plotmap-bar">
        <input
          value={query} inputMode="numeric" placeholder="Find plot no. (e.g. 12 or COMM-12)"
          onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && find(query)}
        />
        <button className="button button-white small-btn" onClick={() => find(query)}>Find</button>
        <button className="button button-white small-btn" onClick={() => { sceneRef.current?.reset(); setPicked(null); }}>Reset</button>
        {projects.length > 1 && (
          <select value={active} onChange={(e) => { setChosen(e.target.value); setPicked(null); }} aria-label="Project">
            {projects.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        )}
        <button
          className={`button small-btn ${filter === 'ALL' ? 'button-primary' : 'button-white'}`}
          onClick={() => setFilter('ALL')}
        >
          All <b>{PLOT_LAYOUT.length}</b>
        </button>
        {Object.entries(STATUS).filter(([key]) => key !== 'COMPANY_HOLD').map(([key, meta]) => (   // no filter button for company hold
          <button
            key={key}
            className={`button small-btn ${filter === key ? 'button-primary' : 'button-white'}`}
            onClick={() => setFilter(filter === key ? 'ALL' : key)}
            title={`Show only plots that are ${meta.label.toLowerCase()}`}
          >
            <i style={{ background: meta.css, display: 'inline-block', width: 9, height: 9, borderRadius: 2, marginRight: 5 }} />
            {meta.label} <b>{counts[key]}</b>
          </button>
        ))}
      </div>

      {active && <p className="plotmap-project">Showing <b>{active}</b> · plot numbers are matched on digits only — “COMM-01” maps to plot 1 of the drawing.</p>}
      {!active && <p className="plotmap-project">No plots of this organisation map to the drawing yet — add plots numbered 1–225 to light the map up.</p>}
      {error && <p className="empty-note" role="alert">{error}</p>}

      <div className="plotmap-scroll">
        <div className="plotmap-3d" ref={mount} aria-label="Plot map" />
        {!ready && !error && <p className="empty-note">Loading the plot map…</p>}
        {shown && (
          <div className="plotmap-panel">
            <div>
              <b>Plot {shown.no}</b>
              {shown.dim ? <span className="sm"> · {shown.dim}</span> : null}
            </div>
            <div>Area: {shown.area ? `${shown.area} sq ft (${(shown.area * 0.092903).toFixed(1)} sq m)` : '—'}</div>
            <div>
              Status:{' '}
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: shown.status.css, marginRight: 5 }} />
              {shown.status.label}
            </div>
            <div className="sm">Drag to pan · scroll to zoom</div>
          </div>
        )}
        <span className="plotmap-hint">Drag: pan · Scroll / pinch: zoom · Click a plot</span>
      </div>
    </div>
  );
}
