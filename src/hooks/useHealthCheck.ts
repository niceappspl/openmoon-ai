import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ProbeResult {
  ok: boolean;
  message: string;
}

interface McpHealth {
  serversTotal: number;
  serversStarted: number;
  tools: number;
}

interface PermissionStatus {
  accessibility: boolean;
  screenRecording: boolean;
  automation: boolean;
}

export interface HealthStatus {
  provider: ProbeResult;
  mcp: McpHealth;
  permissions: PermissionStatus;
}

export interface HealthCheck {
  /** Latest aggregated health snapshot, or null before the first check. */
  health: HealthStatus | null;
  /** True while a check is in flight. */
  checking: boolean;
  /** Re-run the aggregated health check on demand. */
  recheck: () => void;
}

/**
 * Runs the startup health check (provider reachability, MCP host status and
 * macOS permissions) once `ready` becomes true, and exposes a manual re-check.
 */
export const useHealthCheck = (ready: boolean): HealthCheck => {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const recheck = useCallback(async () => {
    setChecking(true);
    try {
      const next = await invoke<HealthStatus>('health_check');
      setHealth(next);
    } catch {
      setHealth(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (ready) {
      recheck();
    }
  }, [ready, recheck]);

  return { health, checking, recheck };
};
