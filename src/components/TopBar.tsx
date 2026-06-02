import { X, Settings, Mic } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { HealthBadge } from './HealthBadge';
import type { HealthCheck } from '../hooks/useHealthCheck';

interface TopBarProps {
  showCommandMenu: boolean;
  setShowCommandMenu: (show: boolean) => void;
  ramUsage: number;
  health: HealthCheck;
  onOpenSettings: () => void;
  onOpenProviderSetup: () => void;
}

export const TopBar = ({
  showCommandMenu,
  setShowCommandMenu,
  ramUsage,
  health,
  onOpenSettings,
  onOpenProviderSetup,
}: TopBarProps) => {
  const handleHide = async () => {
    try {
      await invoke('hide_window');
    } catch (error) {
    }
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowCommandMenu(!showCommandMenu)}
          className={`inline-flex items-center justify-center rounded-full border border-white/10 p-1 hover:bg-white/[0.08] active:scale-[0.98] transition ${
            showCommandMenu ? 'bg-white/10' : 'bg-white/5'
          }`}
          aria-label={showCommandMenu ? "Close menu" : "Settings Menu"}
          title={showCommandMenu ? "Close (Esc)" : "Settings & Commands"}
        >
          {showCommandMenu ? (
            <X className="h-3 w-3 text-white/80" />
          ) : (
            <Settings className="h-3 w-3 text-white/80" />
          )}
        </button>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 p-1 hover:bg-white/[0.08] active:scale-[0.98] transition"
          aria-label="Voice input"
          title="Voice input (coming soon)"
        >
          <Mic className="h-3 w-3 text-white/80" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <HealthBadge
          health={health.health}
          checking={health.checking}
          onRecheck={health.recheck}
          onOpenSettings={onOpenSettings}
          onOpenProviderSetup={onOpenProviderSetup}
        />

        {ramUsage > 0 && (
          <div className="flex items-center px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
            <span className="text-[10px] text-white/60 font-medium leading-none">{ramUsage}MB RAM</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleHide}
          className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 p-1 hover:bg-white/[0.08] active:scale-[0.98] transition"
          aria-label="Hide Window"
          title="Hide (Cmd+Shift+Space to reopen)"
        >
          <X className="h-3 w-3 text-white/80" />
        </button>
      </div>
    </div>
  );
};
