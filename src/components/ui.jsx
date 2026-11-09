// Componentes básicos reutilizáveis.

import { useEffect, useRef, useState, useId } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Minus, Plus, X, CircleAlert, CheckCircle2 } from 'lucide-preact';
import { formatNumber, parseQty } from '../models/units.js';

// ---------- Modal (dialog nativo: foco preso, Esc, camada superior) ----------

let openModals = 0;
const lockScroll = () => {
  openModals++;
  document.documentElement.style.overflow = 'hidden';
};
const unlockScroll = () => {
  openModals = Math.max(0, openModals - 1);
  if (openModals === 0) document.documentElement.style.overflow = '';
};

export function Modal({ open, onClose, title, subtitle, size = '', full = false, footer, children, labelledBy }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!open || !d) return;
    if (!d.open) d.showModal();
    lockScroll();
    return () => {
      unlockScroll();
      if (d.open) d.close();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <dialog
      ref={ref}
      class={`dialog ${size} ${full ? 'full' : ''}`}
      aria-labelledby={labelledBy ?? titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose?.();
      }}
    >
      <div class="dialog-panel" tabIndex={-1}>
        {title != null && (
          <div class="dialog-head">
            <div class="grow">
              <h2 id={titleId}>{title}</h2>
              {subtitle && <p class="sub">{subtitle}</p>}
            </div>
            <button type="button" class="icon-btn" onClick={onClose} aria-label="Fechar">
              <X size={20} />
            </button>
          </div>
        )}
        <div class="dialog-body">{children}</div>
        {footer && <div class="dialog-foot">{footer}</div>}
      </div>
    </dialog>,
    document.body,
  );
}

// ---------- Toasts ----------

let toastListener = null;
let toastSeq = 0;

export function toast(message, opts = {}) {
  toastListener?.({ id: ++toastSeq, message, ...opts });
}

export function ToastRegion() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    toastListener = (t) => {
      setItems((list) => [...list.slice(-2), t]);
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), t.duration ?? (t.action ? 6000 : 3200));
    };
    return () => (toastListener = null);
  }, []);
  return (
    <div class="toast-region" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} class={`toast ${t.type === 'error' ? 'error' : ''}`}>
          {t.type === 'error' ? <CircleAlert size={18} /> : <CheckCircle2 size={18} />}
          <span class="grow">{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action.onClick();
                setItems((list) => list.filter((x) => x.id !== t.id));
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- Confirmação (promessa) ----------

let confirmListener = null;

/** Abre um diálogo de confirmação. Resolve com o id do botão escolhido (ou false). */
export function confirmDialog(opts) {
  return new Promise((resolve) => confirmListener?.({ ...opts, resolve }));
}

export function ConfirmHost() {
  const [req, setReq] = useState(null);
  useEffect(() => {
    confirmListener = setReq;
    return () => (confirmListener = null);
  }, []);
  const close = (value) => {
    req?.resolve(value);
    setReq(null);
  };
  if (!req) return null;
  const actions = req.actions ?? [{ id: true, label: req.confirmLabel ?? 'Confirmar', variant: req.danger ? 'btn-danger' : 'btn-primary' }];
  return (
    <Modal
      open
      size="sm"
      title={req.title}
      onClose={() => close(false)}
      footer={
        <>
          <button type="button" class="btn btn-secondary" onClick={() => close(false)}>
            {req.cancelLabel ?? 'Cancelar'}
          </button>
          {actions.map((a) => (
            <button key={String(a.id)} type="button" class={`btn ${a.variant ?? 'btn-primary'}`} onClick={() => close(a.id)}>
              {a.label}
            </button>
          ))}
        </>
      }
    >
      {typeof req.message === 'string' ? <p>{req.message}</p> : req.message}
    </Modal>
  );
}

// ---------- Stepper numérico ----------

export function Stepper({ value, onChange, step = 1, min = 0, max = 100000, unit, label, size = '', decimals = 2 }) {
  const [text, setText] = useState(formatNumber(value ?? 0, decimals));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(formatNumber(value ?? 0, decimals));
  }, [value]);
  const commit = (n) => {
    const v = Math.min(max, Math.max(min, Math.round(n * 1000) / 1000));
    setText(formatNumber(v, decimals));
    if (v !== value) onChange(v);
  };
  return (
    <div class={`stepper ${size}`} role="group" aria-label={label}>
      <button type="button" aria-label={`Diminuir ${label ?? ''}`} disabled={(value ?? 0) <= min} onClick={() => commit((value ?? 0) - step)}>
        <Minus size={16} />
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        aria-label={label}
        onFocus={(e) => {
          focused.current = true;
          e.currentTarget.select();
        }}
        onInput={(e) => setText(e.currentTarget.value)}
        onBlur={() => {
          focused.current = false;
          const n = parseQty(text);
          if (n == null) setText(formatNumber(value ?? 0, decimals));
          else commit(n);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <button type="button" aria-label={`Aumentar ${label ?? ''}`} disabled={(value ?? 0) >= max} onClick={() => commit((value ?? 0) + step)}>
        <Plus size={16} />
      </button>
      {unit && <span class="unit">{unit}</span>}
    </div>
  );
}

// ---------- Menu suspenso ----------

export function Menu({ trigger, children, label = 'Mais ações', align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector('.menu-list button')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div class="menu" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-haspopup': 'menu', label })}
      {open && (
        <div class="menu-list" role="menu" style={align === 'left' ? 'left:0;right:auto' : ''} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div class="empty">
      {Icon && <Icon size={36} strokeWidth={1.5} />}
      {title && <h3>{title}</h3>}
      {children && <p class="small">{children}</p>}
      {action}
    </div>
  );
}

export function Chip({ pressed, onClick, children, ...rest }) {
  return (
    <button type="button" class="chip" aria-pressed={pressed ? 'true' : 'false'} onClick={onClick} {...rest}>
      {children}
    </button>
  );
}

export function Segmented({ options, value, onChange, label, block = false }) {
  return (
    <div class={`segmented ${block ? 'block' : ''}`} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id ? 'true' : 'false'}
          onClick={() => onChange(o.id)}
        >
          {o.icon && <o.icon size={16} />}
          {o.label}
          {o.count != null && <span class="muted xsmall">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, label }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
