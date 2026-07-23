export interface SurfaceLink {
  id: string;
  label: string;
  url: string;
}

export function buildSurfaceLinks(config: {
  operatorConsole: string;
  configTool: string;
  analytics: string;
}): SurfaceLink[] {
  return [
    { id: 'operator-console', label: 'Operator Console', url: config.operatorConsole },
    { id: 'config-tool', label: 'Config Tooling', url: config.configTool },
    { id: 'analytics', label: 'Analytics', url: config.analytics },
  ];
}

export function SurfaceNav({
  active,
  surfaces,
}: {
  active: string;
  surfaces: readonly SurfaceLink[];
}) {
  return (
    <nav
      style={{
        display: 'flex',
        gap: 4,
        padding: '8px 20px',
        borderBottom: '1px solid var(--hcaf-border)',
        background: 'var(--hcaf-bg)',
      }}
    >
      {surfaces.map((surface) => {
        const selected = surface.id === active;
        return (
          <a
            key={surface.id}
            href={surface.url}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--hcaf-radius)',
              fontSize: 12,
              fontWeight: selected ? 600 : 500,
              textDecoration: 'none',
              color: selected ? 'var(--hcaf-primary)' : 'var(--hcaf-text-muted)',
              background: selected ? 'rgba(59,130,246,0.1)' : 'transparent',
            }}
          >
            {surface.label}
          </a>
        );
      })}
    </nav>
  );
}
