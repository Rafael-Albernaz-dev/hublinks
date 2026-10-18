import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Icon } from '../icons';

export function ModalDialog({
  titleId,
  chip,
  title,
  description,
  icon = 'Settings2',
  logoDataUrl,
  onClose,
  children,
}: {
  titleId: string;
  chip: string;
  title: string;
  description?: ReactNode;
  icon?: 'Settings2' | 'KeyRound' | 'LockKeyhole' | 'Users' | 'Trash' | 'Plus' | 'Edit';
  logoDataUrl?: string | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = cardRef.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button, a[href], input:not(.visually-hidden), select, textarea, [tabindex="0"]',
        ) ?? [],
      ).filter((node) => !node.hasAttribute('disabled'));
    focusable()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      }
      if (event.key === 'Tab') {
        const nodes = focusable();
        if (!nodes.length) return;
        const next = event.shiftKey ? nodes.at(-1) : nodes[0];
        if (
          (event.shiftKey && document.activeElement === nodes[0]) ||
          (!event.shiftKey && document.activeElement === nodes.at(-1))
        ) {
          event.preventDefault();
          next?.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, []);

  return (
    <div
      className="hublink-modal-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="hublink-modal-card"
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button type="button" className="hublink-modal-close" aria-label="Fechar" onClick={onClose}>
          ×
        </button>
        <div className="hublink-modal-header">
          <div className="hublink-modal-icon" aria-hidden="true">
            {logoDataUrl ? <img src={logoDataUrl} alt="" /> : <Icon name={icon} />}
          </div>
          <div>
            <span className="hublink-modal-chip">{chip}</span>
            <h2 id={titleId}>{title}</h2>
          </div>
        </div>
        {description && <p className="hublink-modal-desc">{description}</p>}
        {children}
      </div>
    </div>
  );
}
