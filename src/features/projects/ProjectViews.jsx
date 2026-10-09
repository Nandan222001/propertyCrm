import React from 'react';
import { X } from 'lucide-react';
import { projectFormValues } from '../../utils/projects';
import { Badge } from '../../components/common/Badge';

function Shell({ kicker, title, sub, close, children, footer }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal view-modal" role="dialog" aria-label={title}>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">{kicker}</span>
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>
        {children}
        <div className="modal-actions">
          {footer}
          <button type="button" className="button button-white" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}

const Facts = ({ rows }) => (
  <dl className="view-facts">
    {rows.map(([label, value]) => (
      <React.Fragment key={label}><dt>{label}</dt><dd>{value || '—'}</dd></React.Fragment>
    ))}
  </dl>
);

/** Read-only plot details (the row action behind "View specs"). */
export function PlotViewModal({ plot, close, onBook }) {
  const [id, layout, area, facing, price, status, customer, agent, project] = plot;
  return (
    <Shell
      kicker={`PLOT · ${project}`}
      title={`Plot ${id}`}
      sub={layout}
      close={close}
      footer={onBook && status === 'AVAILABLE' && (
        <button type="button" className="button button-primary" onClick={() => { close(); onBook(plot); }}>Book this plot</button>
      )}
    >
      <Facts rows={[
        ['Project', project], ['Layout', layout], ['Area', area ? `${area} sq.ft` : ''], ['Facing', facing],
        ['Price', price ? `₹${price}` : ''], ['Status', <Badge key="s">{status}</Badge>],
        ['Customer', customer && customer !== '—' ? customer : ''], ['Sales agent', agent && agent !== '—' ? agent : ''],
      ]}
      />
    </Shell>
  );
}

/** Read-only project summary with its plot inventory. */
export function ProjectViewModal({ project, plots, close, onEdit }) {
  const form = projectFormValues(project);
  const mine = plots.filter((p) => p[8] === project[0]);
  const count = (status) => mine.filter((p) => p[5] === status).length;
  return (
    <Shell
      kicker="PROJECT"
      title={project[0]}
      sub={project[1]}
      close={close}
      footer={onEdit && <button type="button" className="button button-primary" onClick={() => { close(); onEdit(project); }}>Edit project</button>}
    >
      <Facts rows={[
        ['Status', <Badge key="s">{form.active ? 'Active' : 'Inactive'}</Badge>],
        ['RERA no.', form.rera], ['Location', form.location],
        ['Total plots', project[2]], ['Booked', project[3]], ['On hold', project[4]],
        ['Est. revenue', project[5] === '—' ? '' : `₹${project[5]}`], ['Base rate', form.rate ? `₹${form.rate} / sq.ft` : ''],
      ]}
      />
      <div className="view-plot-counts">
        {['AVAILABLE', 'BOOKED', 'HOLD', 'SOLD'].map((s) => (
          <span key={s}><b>{count(s)}</b><small>{s}</small></span>
        ))}
      </div>
    </Shell>
  );
}
