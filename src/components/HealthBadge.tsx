import { useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { Button } from './ui';
import type { HealthStatus } from '../hooks/useHealthCheck';

interface HealthBadgeProps {
  health: HealthStatus | null;
  checking: boolean;
  onRecheck: () => void;
  onOpenSettings: () => void;
  onOpenProviderSetup: () => void;
  onExpandedChange?: (expanded: boolean) => void;
}

interface CheckRow {
  key: string;
  label: string;
  ok: boolean;
  message: string;
  fix?: { label: string; action: () => void };
}

const dotClass = (ok: boolean) => (ok ? 'bg-emerald-400' : 'bg-amber-400');

/**
 * Compact glass-styled startup readiness indicator: a pill summarising provider
 * reachability, MCP host status and permissions, expandable to per-check detail
 * with shortcuts to fix a failing check or re-run the health check.
 */
export const HealthBadge = ({
  health,
  checking,
  onRecheck,
  onOpenSettings,
  onOpenProviderSetup,
  onExpandedChange,
}: HealthBadgeProps) => {
  const [expanded, setExpanded] = useState(false);

  const toggle = (v: boolean) => {
    setExpanded(v);
    onExpandedChange?.(v);
  };

  const providerOk = health?.provider.ok ?? false;
  const mcpOk = (health?.mcp.serversStarted ?? 0) > 0;
  const permsOk = !!health && health.permissions.accessibility && health.permissions.screenRecording;
  const allOk = providerOk && mcpOk && permsOk;

  const summaryLabel = checking && !health ? 'Checking…' : allOk ? 'Ready' : 'Issues';
  const summaryOk = !!health && allOk;

  const rows: CheckRow[] = [
    {
      key: 'provider',
      label: 'Provider',
      ok: providerOk,
      message: health?.provider.message ?? 'Not checked yet',
      fix: providerOk ? undefined : { label: 'Set up', action: onOpenProviderSetup },
    },
    {
      key: 'mcp',
      label: 'MCP servers',
      ok: mcpOk,
      message: health
        ? `${health.mcp.serversStarted}/${health.mcp.serversTotal} started · ${health.mcp.tools} tools`
        : 'Not checked yet',
    },
    {
      key: 'permissions',
      label: 'Permissions',
      ok: permsOk,
      message: health
        ? `Accessibility ${health.permissions.accessibility ? 'on' : 'off'} · Screen ${
            health.permissions.screenRecording ? 'on' : 'off'
          }`
        : 'Not checked yet',
      fix: permsOk ? undefined : { label: 'Open Settings', action: onOpenSettings },
    },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => toggle(!expanded)}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-white/[0.08] active:scale-[0.98] transition"
        aria-label="App health status"
        title="App readiness"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass(summaryOk)} ${checking ? 'animate-pulse' : ''}`} />
        <span className="text-[10px] text-white/70 font-medium leading-none">{summaryLabel}</span>
      </button>

      {expanded && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-60 rounded-xl bg-black/90 border border-white/10 p-2.5 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Activity className="h-3 w-3 text-white/60" />
              <span className="text-[11px] text-white/80 font-medium">Readiness</span>
            </div>
            <button
              type="button"
              onClick={onRecheck}
              className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 p-1 hover:bg-white/10 transition"
              aria-label="Re-check health"
              title="Re-check"
            >
              <RefreshCw className={`h-3 w-3 text-white/70 ${checking ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="space-y-1.5">
            {rows.map((row) => (
              <div key={row.key} className="flex items-start gap-2">
                <span className={`mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotClass(row.ok)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-white/80">{row.label}</span>
                    {row.fix && (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        className="text-[9px] px-1.5 py-0.5"
                        onClick={row.fix.action}
                      >
                        {row.fix.label}
                      </Button>
                    )}
                  </div>
                  <p className="text-[9px] text-white/45 leading-relaxed truncate">{row.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
