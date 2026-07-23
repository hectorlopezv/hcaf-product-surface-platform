import { useEffect, useState } from 'react';
import { Badge, Card, DataTable, SurfaceNav } from '@hcaf/ui';
import { env } from './env';

interface AnalyticsSummary {
  generatedAt: string;
  totals: {
    activeCalls: number;
    liveCalls: number;
    totalActiveModules: number;
    pendingRecommendations: number;
    totalFeedbackEvents: number;
  };
  calls: Array<{
    callId: string;
    patientName: string;
    specialty: string;
    status: 'live' | 'waiting';
    activeModuleCount: number;
    agentStatus: string;
    schemaVersion: string;
    ontologyVersion: string;
    feedbackCount: number;
  }>;
  feedbackEvents: Array<{
    callId: string;
    patientName: string;
    action: string;
    moduleId: string;
    feedback: string;
    originalAction: string;
    timestamp: string;
  }>;
}

export function App() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    const load = () => {
      fetch(`${env.apiUrl}/v1/analytics/summary`)
        .then((r) => r.json())
        .then(setSummary);
    };
    load();
    const timer = setInterval(load, env.pollMs);
    return () => clearInterval(timer);
  }, []);

  const totals = summary?.totals;

  return (
    <div className="hcaf-ui hcaf-ui--comfortable" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SurfaceNav active="analytics" surfaces={env.surfaces} />
      <header style={{ padding: '16px 20px', borderBottom: '1px solid var(--hcaf-border)', background: 'var(--hcaf-surface)' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>HCAF Analytics</div>
        <div style={{ fontSize: 12, color: 'var(--hcaf-text-muted)', marginTop: 4 }}>
          Cross-call metrics refreshed every {env.pollMs / 1000}s
        </div>
      </header>

      <main style={{ flex: 1, padding: 20, maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {[
              { label: 'Active calls', value: totals?.activeCalls },
              { label: 'Live calls', value: totals?.liveCalls },
              { label: 'Active modules', value: totals?.totalActiveModules },
              { label: 'Pending agent recs', value: totals?.pendingRecommendations },
              { label: 'Override events', value: totals?.totalFeedbackEvents },
            ].map((stat) => (
              <Card key={stat.label} title={stat.label}>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{stat.value ?? '—'}</div>
              </Card>
            ))}
          </div>

          <Card title="Call sessions">
            {summary ? (
              <DataTable
                rows={summary.calls}
                columns={['patientName', 'specialty', 'status', 'activeModuleCount', 'agentStatus', 'schemaVersion', 'feedbackCount']}
              />
            ) : (
              <div style={{ color: 'var(--hcaf-text-muted)', fontSize: 13 }}>Loading…</div>
            )}
          </Card>

          <Card title="Operator feedback log" actions={<Badge variant="default">audit trail</Badge>}>
            {summary && summary.feedbackEvents.length > 0 ? (
              <DataTable
                rows={summary.feedbackEvents}
                columns={['patientName', 'action', 'moduleId', 'originalAction', 'feedback', 'timestamp']}
              />
            ) : (
              <div style={{ color: 'var(--hcaf-text-muted)', fontSize: 13 }}>
                No override feedback yet — use Operator Console to submit overrides.
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
