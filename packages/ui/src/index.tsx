import type { CSSProperties, ReactNode } from 'react';

export { DataTable } from './data-table';

export type Density = 'compact' | 'comfortable';

export function cn(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function Badge({
  children,
  variant = 'default',
}: {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const colors: Record<string, CSSProperties> = {
    default: { background: 'var(--hcaf-surface-elevated)', color: 'var(--hcaf-text)' },
    success: { background: 'rgba(34,197,94,0.15)', color: 'var(--hcaf-success)' },
    warning: { background: 'rgba(245,158,11,0.15)', color: 'var(--hcaf-warning)' },
    danger: { background: 'rgba(239,68,68,0.15)', color: 'var(--hcaf-danger)' },
    info: { background: 'rgba(59,130,246,0.15)', color: 'var(--hcaf-primary)' },
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
        ...colors[variant],
      }}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
}) {
  const styles: Record<string, CSSProperties> = {
    primary: { background: 'var(--hcaf-primary)', color: '#fff', border: 'none' },
    secondary: { background: 'var(--hcaf-surface-elevated)', color: 'var(--hcaf-text)', border: '1px solid var(--hcaf-border)' },
    ghost: { background: 'transparent', color: 'var(--hcaf-text-muted)', border: '1px solid var(--hcaf-border)' },
    danger: { background: 'var(--hcaf-danger)', color: '#fff', border: 'none' },
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 'var(--hcaf-radius)',
        fontSize: '12px',
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section
      style={{
        background: 'var(--hcaf-surface)',
        border: '1px solid var(--hcaf-border)',
        borderRadius: 'var(--hcaf-radius)',
        overflow: 'hidden',
      }}
    >
      {title && (
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            borderBottom: '1px solid var(--hcaf-border)',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--hcaf-text-muted)',
          }}
        >
          <span>{title}</span>
          {actions}
        </header>
      )}
      <div style={{ padding: '12px' }}>{children}</div>
    </section>
  );
}

export function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return <Card title={title}>{children}</Card>;
}

export function Stack({ children, gap = 12 }: { children: ReactNode; gap?: number }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap }}>{children}</div>;
}

export function Grid({ children, columns = 2 }: { children: ReactNode; columns?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 12 }}>
      {children}
    </div>
  );
}

export function SplitGrid({ left, right, ratio = '1fr 1fr' }: { left: ReactNode; right: ReactNode; ratio?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: ratio, gap: 12 }}>
      <div>{left}</div>
      <div>{right}</div>
    </div>
  );
}

export function Field({
  label,
  value,
  type = 'string',
}: {
  label: string;
  value: unknown;
  type?: string;
}) {
  const display =
    value === undefined || value === null
      ? '—'
      : type === 'currency' && typeof value === 'number'
        ? `$${value.toFixed(2)}`
        : type === 'boolean'
          ? value ? 'Yes' : 'No'
          : String(value);

  return (
    <div>
      <div style={{ fontSize: '10px', color: 'var(--hcaf-text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 500 }}>{display}</div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  subtext,
  variant = 'default',
}: {
  label: string;
  value: ReactNode;
  subtext?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const border: Record<string, string> = {
    default: 'var(--hcaf-border)',
    success: 'var(--hcaf-success)',
    warning: 'var(--hcaf-warning)',
    danger: 'var(--hcaf-danger)',
  };
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 'var(--hcaf-radius)',
        border: `1px solid ${border[variant]}`,
        background: 'var(--hcaf-surface-elevated)',
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--hcaf-text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
      {subtext && <div style={{ fontSize: 10, color: 'var(--hcaf-text-muted)', marginTop: 4 }}>{subtext}</div>}
    </div>
  );
}

export function ProgressBar({
  label,
  value,
  max,
  format = 'percent',
}: {
  label: string;
  value: number;
  max: number;
  format?: 'percent' | 'currency';
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const display =
    format === 'currency' ? `$${value.toLocaleString()} / $${max.toLocaleString()}` : `${pct}%`;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--hcaf-text-muted)', marginBottom: 4 }}>
        <span>{label}</span>
        <span>{display}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--hcaf-border)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: pct >= 90 ? 'var(--hcaf-danger)' : pct >= 70 ? 'var(--hcaf-warning)' : 'var(--hcaf-primary)',
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}

export function Alert({
  children,
  variant = 'info',
  title,
}: {
  children: ReactNode;
  variant?: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
}) {
  const styles: Record<string, { bg: string; border: string }> = {
    info: { bg: 'rgba(59,130,246,0.08)', border: 'var(--hcaf-primary)' },
    warning: { bg: 'rgba(245,158,11,0.08)', border: 'var(--hcaf-warning)' },
    danger: { bg: 'rgba(239,68,68,0.08)', border: 'var(--hcaf-danger)' },
    success: { bg: 'rgba(34,197,94,0.08)', border: 'var(--hcaf-success)' },
  };
  const s = styles[variant];
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 'var(--hcaf-radius)',
        borderLeft: `3px solid ${s.border}`,
        background: s.bg,
        fontSize: 12,
      }}
    >
      {title && <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>}
      {children}
    </div>
  );
}

export interface TimelineItem {
  time: string;
  title: string;
  detail?: string;
  status?: string;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 12 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: item.status === 'denied' ? 'var(--hcaf-danger)' : item.status === 'pending' ? 'var(--hcaf-warning)' : 'var(--hcaf-success)',
                marginTop: 4,
              }}
            />
            {i < items.length - 1 && <div style={{ flex: 1, width: 2, background: 'var(--hcaf-border)', marginTop: 4 }} />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{item.title}</span>
              <span style={{ fontSize: 10, color: 'var(--hcaf-text-muted)' }}>{item.time}</span>
            </div>
            {item.detail && <div style={{ fontSize: 11, color: 'var(--hcaf-text-muted)', marginTop: 2 }}>{item.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatusDot({ status }: { status: 'live' | 'connecting' | 'offline' }) {
  const color =
    status === 'live' ? 'var(--hcaf-success)' : status === 'connecting' ? 'var(--hcaf-warning)' : 'var(--hcaf-danger)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '11px' }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          boxShadow: status === 'live' ? `0 0 6px ${color}` : undefined,
        }}
      />
      {status === 'live' ? 'Live call' : status === 'connecting' ? 'Connecting' : 'Offline'}
    </span>
  );
}

export function statusBadgeVariant(status: unknown): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  const s = String(status ?? '').toLowerCase();
  if (['active', 'approved', 'on_file', 'signed'].includes(s)) return 'success';
  if (['pending', 'submitted', 'not_started', 'missing'].includes(s)) return 'warning';
  if (['denied', 'expired', 'high', 'unsigned'].includes(s)) return 'danger';
  return 'default';
}

export { SurfaceNav, buildSurfaceLinks, type SurfaceLink } from './surface-nav';
