import { Chrome, FileText, Calendar, Music, Terminal } from 'lucide-react';

interface QuickActionsProps {
  onActionClick: (prompt: string) => void;
}

const QUICK_ACTIONS = [
  { icon: Chrome, label: 'Chrome', prompt: 'open Google Chrome' },
  { icon: FileText, label: 'Note', prompt: 'remember ' },
  { icon: Calendar, label: 'Calendar', prompt: 'show my calendar' },
  { icon: Music, label: 'Music', prompt: 'play music' },
  { icon: Terminal, label: 'Terminal', prompt: 'run shell command ' },
];

export const QuickActions = ({ onActionClick }: QuickActionsProps) => {
  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {QUICK_ACTIONS.map((action, index) => {
          const Icon = action.icon;
          return (
            <button
              key={index}
              onClick={() => onActionClick(action.prompt)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 transition-all whitespace-nowrap"
              title={action.label}
            >
              <Icon className="h-3 w-3 text-white/70" />
              <span className="text-[10px] text-white/60">{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
