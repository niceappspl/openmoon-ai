import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Save, Check } from 'lucide-react';

interface RecordedStep {
  action: string;
  params: Record<string, unknown>;
}

interface SaveWorkflowButtonProps {
  steps: RecordedStep[];
}

export const SaveWorkflowButton = ({ steps }: SaveWorkflowButtonProps) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const workflow = {
      id: `wf-${Date.now()}`,
      name: trimmed,
      description: 'Saved from agent run',
      icon: '⚡',
      steps,
    };
    try {
      await invoke('save_workflow', { workflow });
      setSaved(true);
      setEditing(false);
    } catch {
      /* ignore persistence errors */
    }
  };

  if (saved) {
    return (
      <div className="mt-2 flex items-center gap-1 text-xs text-green-400">
        <Check className="h-3 w-3" />
        Saved as workflow
      </div>
    );
  }

  if (editing) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          placeholder="Workflow name"
          className="flex-1 px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white/90 placeholder-white/30 focus:outline-none focus:border-blue-500/50"
        />
        <button
          onClick={save}
          className="px-2 py-1 rounded text-xs bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition-colors"
        >
          Save
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="mt-2 flex items-center gap-1 px-2 py-1 rounded text-xs text-white/60 border border-white/10 hover:bg-white/5 hover:text-white/80 transition-colors"
      title={`${steps.length} step${steps.length > 1 ? 's' : ''}`}
    >
      <Save className="h-3 w-3" />
      Save as workflow
    </button>
  );
};
