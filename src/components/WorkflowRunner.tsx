import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Play, RefreshCw, ExternalLink, X } from 'lucide-react';

interface WorkflowStep {
  action: string;
  params: Record<string, any>;
  delay?: number;
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  icon: string;
  hotkey?: string;
  steps: WorkflowStep[];
}

interface WorkflowRunnerProps {
  onClose?: () => void;
}

export const WorkflowRunner = ({ onClose }: WorkflowRunnerProps) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runningWorkflow, setRunningWorkflow] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      setIsLoading(true);
      const savedWorkflows = await invoke<Workflow[]>('load_workflows');
      
      // Default workflows if no saved ones
      const defaultWorkflows: Workflow[] = [
        {
          id: 'morning',
          name: 'Morning Routine',
          description: 'Start your productive day',
          icon: '☀️',
          hotkey: 'cmd+shift+m',
          steps: [
            { action: 'open_app', params: { app: 'Mail' } },
            { action: 'open_app', params: { app: 'Spotify' }, delay: 1000 },
            { action: 'play_pause_media', params: {} },
            { action: 'show_notification', params: { 
              title: 'Good morning!', 
              message: 'Let\'s make today count!' 
            }}
          ]
        },
        {
          id: 'focus',
          name: 'Focus Mode',
          description: 'Eliminate distractions',
          icon: '🎯',
          hotkey: 'cmd+shift+f',
          steps: [
            { action: 'focus_mode', params: { enabled: true } },
            { action: 'quit_app', params: { app: 'Discord' } },
            { action: 'quit_app', params: { app: 'Slack' } },
            { action: 'start_pomodoro', params: { duration: 25 } }
          ]
        },
        {
          id: 'break',
          name: 'Take a Break',
          description: 'Time to rest and recharge',
          icon: '☕',
          steps: [
            { action: 'focus_mode', params: { enabled: false } },
            { action: 'show_notification', params: { 
              title: 'Break Time! ☕', 
              message: 'Stand up, stretch, grab some water' 
            }},
            { action: 'set_volume', params: { volume: 30 } },
            { action: 'open_app', params: { app: 'Spotify' } }
          ]
        },
        {
          id: 'end_day',
          name: 'End of Day',
          description: 'Wrap up your work',
          icon: '🌙',
          steps: [
            { action: 'show_notification', params: { 
              title: 'Wrapping up', 
              message: 'Saving your work...' 
            }},
            { action: 'quit_app', params: { app: 'Slack' }, delay: 1000 },
            { action: 'quit_app', params: { app: 'Discord' }, delay: 500 },
            { action: 'quit_app', params: { app: 'Mail' }, delay: 500 },
            { action: 'sleep_display', params: {} }
          ]
        }
      ];
      
      // Use saved workflows or defaults
      setWorkflows(savedWorkflows.length > 0 ? savedWorkflows : defaultWorkflows);
    } catch (error) {
      console.error('Failed to load workflows:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const executeWorkflow = async (workflow: Workflow) => {
    try {
      setRunningWorkflow(workflow.id);
      await invoke('execute_workflow', { workflow });
    } catch (error) {
      console.error('Failed to execute workflow:', error);
    } finally {
      setRunningWorkflow(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 min-h-[400px] flex items-center justify-center">
        <p className="text-sm text-white/50">Loading workflows...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[500px]">
      <div className="p-4 pb-0">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white/90 mb-1">Quick Workflows</h2>
            <p className="text-xs text-white/50">Run your automated tasks with one click</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadWorkflows}
              className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
              title="Refresh workflows"
            >
              <RefreshCw className="h-3 w-3 text-white/50" />
            </button>
            <a
              href="https://openmoon.app/workflows"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
              title="Manage workflows online"
            >
              <ExternalLink className="h-3 w-3 text-white/50" />
            </a>
            {onClose && (
              <>
                <div className="w-px h-4 bg-white/10" />
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
                  title="Close workflows (Esc)"
                >
                  <X className="h-3 w-3 text-white/50" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center px-4 pb-4">
        <div className="grid grid-cols-2 gap-3 max-w-2xl mx-auto w-full">
          {workflows.map((workflow) => (
            <button
              key={workflow.id}
              onClick={() => executeWorkflow(workflow)}
              disabled={runningWorkflow === workflow.id}
              className={`p-4 rounded-lg border transition-all text-left group ${
                runningWorkflow === workflow.id
                  ? 'border-green-400/50 bg-green-500/10'
                  : 'border-white/10 hover:border-white/20 hover:bg-white/5'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-2xl">{workflow.icon}</span>
                {runningWorkflow === workflow.id ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-green-400 border-t-transparent" />
                ) : (
                  <Play className="h-4 w-4 text-white/30 group-hover:text-white/60 transition-colors" />
                )}
              </div>
              <h3 className="text-sm font-medium text-white/80 mb-1">{workflow.name}</h3>
              <p className="text-xs text-white/50">{workflow.description}</p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-[10px] text-white/40">{workflow.steps.length} steps</span>
                {workflow.hotkey && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                    {workflow.hotkey}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 p-3 rounded-lg bg-white/5 border border-white/10 max-w-2xl mx-auto w-full">
          <p className="text-xs text-white/50 text-center">
            Want to create or edit workflows? Visit{' '}
            <a
              href="https://openmoon.app/workflows"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              openmoon.app/workflows
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
