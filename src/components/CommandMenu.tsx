import { Settings, Sparkles, LogOut, Zap, BookOpen } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface CommandMenuProps {
  onClose: () => void;
  onShowMcpTools: () => void;
  onShowWorkflows?: () => void;
  onShowTestCommands?: () => void;
  onShowSettings?: () => void;
}

export const CommandMenu = ({ onClose, onShowMcpTools, onShowWorkflows, onShowTestCommands, onShowSettings }: CommandMenuProps) => {
  return (
    <div className="mt-2 rounded-lg bg-black/95 border border-white/10 backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="p-2">
        {onShowTestCommands && (
          <button
            onClick={() => {
              onShowTestCommands();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors text-left mb-1"
          >
            <BookOpen className="h-3 w-3 text-blue-400/70" />
            <div className="flex-1">
              <div className="text-xs text-white/80">Test Commands</div>
              <div className="text-[10px] text-white/40">Browse example commands to try</div>
            </div>
          </button>
        )}

        {onShowWorkflows && (
          <button
            onClick={() => {
              onShowWorkflows();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors text-left mb-1"
          >
            <Zap className="h-3 w-3 text-yellow-400/70" />
            <div className="flex-1">
              <div className="text-xs text-white/80">Smart Workflows</div>
              <div className="text-[10px] text-white/40">Automate repetitive tasks</div>
            </div>
          </button>
        )}

        {onShowSettings && (
          <button
            onClick={() => {
              onShowSettings();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors text-left"
          >
            <Settings className="h-3 w-3 text-white/70" />
            <div className="flex-1">
              <div className="text-xs text-white/80">Settings</div>
              <div className="text-[10px] text-white/40">Configure openMOON</div>
            </div>
          </button>
        )}

        <button
          onClick={onShowMcpTools}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors text-left"
        >
          <Sparkles className="h-3 w-3 text-white/70" />
          <div className="flex-1">
            <div className="text-xs text-white/80">MCP Tools</div>
            <div className="text-[10px] text-white/40">View available tools</div>
          </div>
        </button>

        <div className="my-1 border-t border-white/10"></div>

        <button
          onClick={async () => {
            onClose();
            await invoke('hide_window');
          }}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-red-500/10 transition-colors text-left"
        >
          <LogOut className="h-3 w-3 text-red-400/70" />
          <div className="flex-1">
            <div className="text-xs text-red-400/80">Quit openMOON</div>
            <div className="text-[10px] text-red-400/40">Close the application</div>
          </div>
        </button>
      </div>
    </div>
  );
};
