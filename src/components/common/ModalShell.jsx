import React from 'react';
import { X } from 'lucide-react';

/**
 * Accessible modal frame shared by the record/user dialogs: backdrop click and
 * Escape close it, focus stays inside, and the title is announced.
 */
export function ModalShell({ title, subtitle, onClose, children, footer, wide = false }) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className={`modal ${wide ? 'modal-wide' : ''}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-action" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>
        {children}
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  );
}
