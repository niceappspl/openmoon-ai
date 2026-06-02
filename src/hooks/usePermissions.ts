import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface PermissionStatus {
  accessibility: boolean;
  screenRecording: boolean;
  automation: boolean;
}

export type PermissionKind = 'accessibility' | 'screen_recording' | 'automation';

const EMPTY: PermissionStatus = {
  accessibility: false,
  screenRecording: false,
  automation: false,
};

/**
 * Tracks macOS privacy permission grant state and exposes helpers to trigger
 * the system prompt or open the relevant System Settings pane. Re-checks on
 * mount, on window focus, and on a light interval poll.
 */
export const usePermissions = (poll = true) => {
  const [status, setStatus] = useState<PermissionStatus>(EMPTY);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const next = await invoke<PermissionStatus>('check_permissions');
      setStatus(next);
    } catch {
      setStatus(EMPTY);
    } finally {
      setChecking(false);
    }
  }, []);

  const request = useCallback(async (kind: PermissionKind) => {
    try {
      const next = await invoke<PermissionStatus>('request_permission', { kind });
      setStatus(next);
    } catch {
      await refresh();
    }
  }, [refresh]);

  const openSettings = useCallback(async (kind: PermissionKind) => {
    try {
      await invoke('open_permission_settings', { kind });
    } catch {
      /* opening settings is best-effort */
    }
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const id = poll ? window.setInterval(refresh, 2000) : undefined;
    return () => {
      window.removeEventListener('focus', onFocus);
      if (id !== undefined) window.clearInterval(id);
    };
  }, [refresh, poll]);

  return { status, checking, refresh, request, openSettings };
};
