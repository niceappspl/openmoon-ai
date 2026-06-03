import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Shield, Settings as SettingsIcon, CheckCircle, XCircle, AlertTriangle, Bot, Cog, FolderOpen, Globe, Music, Headphones, Chrome, Video, Mic, MessageSquare, Wifi, Bluetooth, ShieldAlert, Clock, ScrollText, Plus, Trash2, Power, Download, Loader2, Key, Plug, Wrench, HelpCircle, FileText, Gauge, History as HistoryIcon, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { Spinner, EmptyState, StatusMessage } from './ui';
import { supportsToolCalling, RECOMMENDED_TOOL_MODELS } from '../utils/ollamaModels';

interface RunRecord {
  id: number;
  prompt: string;
  response: string;
  stepsJson: string;
  createdAt: string;
  provider: string;
  model: string;
}

interface SettingsProps {
  onClose: () => void;
  onReplay?: (prompt: string) => void;
}

type PolicyValue = 'auto' | 'ask' | 'deny';

interface SecuritySettings {
  globalDefault: string;
  toolOverrides: Record<string, string>;
  allowedPaths: string[];
}

interface AppSettings {
  provider: string;
  model: string;
  ollamaBaseUrl: string;
  security: SecuritySettings;
  maxStepsPerSession: number;
  maxCostUsdPerSession: number;
}

interface Trigger {
  id: string;
  name: string;
  kind: string;
  payload: string;
  intervalSecs?: number | null;
  watchPath?: string | null;
  enabled: boolean;
}

interface AuditEntry {
  timestamp: string;
  tool: string;
  args_summary: string;
  decision: string;
  server?: string | null;
  ok: boolean;
}

interface OllamaStatus {
  running: boolean;
  models: string[];
}

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  ollama: 'llama3.1',
  anthropic: 'claude-sonnet-4-5',
  openrouter: 'openai/gpt-4o-mini',
};

interface ModelOption { id: string; label: string }
const PROVIDER_MODELS: Record<string, ModelOption[]> = {
  openai: [
    { id: 'gpt-4o-mini',  label: 'GPT-4o mini' },
    { id: 'gpt-4o',       label: 'GPT-4o' },
    { id: 'gpt-4.1',      label: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano' },
    { id: 'o3-mini',      label: 'o3-mini' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-3-5',  label: 'Claude Haiku 3.5' },
    { id: 'claude-opus-4-5',   label: 'Claude Opus 4.5' },
  ],
  openrouter: [
    { id: 'openai/gpt-4o-mini',                          label: 'GPT-4o mini' },
    { id: 'openai/gpt-4o',                               label: 'GPT-4o' },
    { id: 'anthropic/claude-3.5-sonnet',                 label: 'Claude Sonnet 3.5' },
    { id: 'anthropic/claude-3.5-haiku',                  label: 'Claude Haiku 3.5' },
    { id: 'google/gemini-2.0-flash-001',                 label: 'Gemini 2.0 Flash' },
    { id: 'meta-llama/llama-3.3-70b-instruct',           label: 'Llama 3.3 70B' },
    { id: 'mistralai/mistral-small-3.1-24b-instruct',    label: 'Mistral Small 3.1' },
  ],
};

const DEFAULT_SECURITY: SecuritySettings = {
  globalDefault: 'ask',
  toolOverrides: {},
  allowedPaths: [],
};

const DEFAULT_SETTINGS: AppSettings = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  ollamaBaseUrl: 'http://localhost:11434',
  security: DEFAULT_SECURITY,
  maxStepsPerSession: 8,
  maxCostUsdPerSession: 0.5,
};

const POLICY_OPTIONS: PolicyValue[] = ['auto', 'ask', 'deny'];

interface Permission {
  id: string;
  name: string;
  description: string;
  category: 'system' | 'apps' | 'files' | 'network' | 'media' | 'automation';
  required: boolean;
  status: 'granted' | 'denied' | 'unknown';
  settingsKind?: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PERMISSIONS: Permission[] = [
  {
    id: 'apple_events',
    name: 'Apple Events (Automation)',
    description: 'Application control and system automation',
    category: 'automation',
    required: true,
    status: 'granted',
    settingsKind: 'automation',
    icon: Bot
  },
  {
    id: 'system_events',
    name: 'System Events',
    description: 'System control, keyboard and mouse',
    category: 'automation',
    required: true,
    status: 'granted',
    settingsKind: 'accessibility',
    icon: Cog
  },
  {
    id: 'finder_access',
    name: 'Finder Access',
    description: 'File management and trash operations',
    category: 'files',
    required: true,
    status: 'denied',
    settingsKind: 'files',
    icon: FolderOpen
  },
  {
    id: 'safari_automation',
    name: 'Safari Automation',
    description: 'Safari browser control',
    category: 'apps',
    required: false,
    status: 'unknown',
    settingsKind: 'automation',
    icon: Globe
  },
  {
    id: 'music_automation',
    name: 'Music App Automation',
    description: 'Music app control',
    category: 'media',
    required: false,
    status: 'unknown',
    settingsKind: 'automation',
    icon: Music
  },
  {
    id: 'spotify_automation',
    name: 'Spotify Automation',
    description: 'Spotify app control',
    category: 'media',
    required: false,
    status: 'unknown',
    settingsKind: 'automation',
    icon: Headphones
  },
  {
    id: 'chrome_automation',
    name: 'Chrome Automation',
    description: 'Chrome browser control',
    category: 'apps',
    required: false,
    status: 'unknown',
    settingsKind: 'automation',
    icon: Chrome
  },
  {
    id: 'screen_recording',
    name: 'Screen Recording',
    description: 'Screen recording and screenshots',
    category: 'media',
    required: false,
    status: 'granted',
    settingsKind: 'screen_recording',
    icon: Video
  },
  {
    id: 'microphone',
    name: 'Microphone Access',
    description: 'Microphone access for voice commands',
    category: 'system',
    required: false,
    status: 'granted',
    settingsKind: 'microphone',
    icon: Mic
  },
  {
    id: 'speech_recognition',
    name: 'Speech Recognition',
    description: 'Speech recognition',
    category: 'system',
    required: false,
    status: 'granted',
    settingsKind: 'speech_recognition',
    icon: MessageSquare
  },
  {
    id: 'network_access',
    name: 'Network Access',
    description: 'Network and internet access',
    category: 'network',
    required: true,
    status: 'granted',
    icon: Wifi
  },
  {
    id: 'bluetooth_control',
    name: 'Bluetooth Control',
    description: 'Bluetooth control (requires blueutil)',
    category: 'network',
    required: false,
    status: 'unknown',
    icon: Bluetooth
  }
];

const CATEGORIES = {
  system: { name: 'System', icon: Cog },
  apps: { name: 'Apps', icon: Globe },
  files: { name: 'Files', icon: FolderOpen },
  network: { name: 'Network', icon: Wifi },
  media: { name: 'Media', icon: Music },
  automation: { name: 'Automation', icon: Bot }
};

const ToolCallingBadge = ({ model }: { model: string }) => {
  const supported = supportsToolCalling(model);
  return supported ? (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-green-400 bg-green-500/10 border border-green-500/20">
      <Wrench className="h-2.5 w-2.5" />
      tools ✓
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/20">
      <HelpCircle className="h-2.5 w-2.5" />
      tools unknown
    </span>
  );
};

export const Settings = ({ onClose, onReplay }: SettingsProps) => {
  const [activeTab, setActiveTab] = useState<'permissions' | 'general' | 'security' | 'triggers' | 'audit' | 'history'>('permissions');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);
  const [newOverrideTool, setNewOverrideTool] = useState('');
  const [newAllowedPath, setNewAllowedPath] = useState('');
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [ollamaChecking, setOllamaChecking] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pullMessage, setPullMessage] = useState<string | null>(null);
  const [openaiKeyInput, setOpenaiKeyInput] = useState('');
  const [openaiKeySet, setOpenaiKeySet] = useState(false);
  const [anthropicKeyInput, setAnthropicKeyInput] = useState('');
  const [anthropicKeySet, setAnthropicKeySet] = useState(false);
  const [openrouterKeyInput, setOpenrouterKeyInput] = useState('');
  const [openrouterKeySet, setOpenrouterKeySet] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [systemPromptInput, setSystemPromptInput] = useState('');
  const [savingSystemPrompt, setSavingSystemPrompt] = useState(false);
  const [systemPromptSaved, setSystemPromptSaved] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveKeySuccess, setSaveKeySuccess] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);
  const [logPath, setLogPath] = useState('');
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'available' | 'installing' | 'error'>('idle');
  const [updateInfo, setUpdateInfo] = useState<{ version: string; body: string | null } | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [newTrigger, setNewTrigger] = useState<Trigger>({
    id: '',
    name: '',
    kind: 'prompt',
    payload: '',
    intervalSecs: null,
    watchPath: null,
    enabled: true,
  });

  useEffect(() => {
    invoke<AppSettings>('get_settings')
      .then((loaded) => setSettings({ ...DEFAULT_SETTINGS, ...loaded, security: { ...DEFAULT_SECURITY, ...loaded.security } }))
      .catch(() => {});
  }, []);

  const refreshKeyStatus = () => {
    invoke<boolean>('has_api_key_cmd', { provider: 'openai' })
      .then(setOpenaiKeySet)
      .catch(() => setOpenaiKeySet(false));
    invoke<boolean>('has_api_key_cmd', { provider: 'anthropic' })
      .then(setAnthropicKeySet)
      .catch(() => setAnthropicKeySet(false));
    invoke<boolean>('has_api_key_cmd', { provider: 'openrouter' })
      .then(setOpenrouterKeySet)
      .catch(() => setOpenrouterKeySet(false));
  };

  useEffect(() => {
    refreshKeyStatus();
    invoke<string>('get_system_prompt')
      .then((t) => { setSystemPrompt(t); setSystemPromptInput(t); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    invoke<string>('get_log_path')
      .then(setLogPath)
      .catch(() => setLogPath(''));
  }, []);

  const handleOpenLogs = () => {
    invoke('open_logs').catch(() => {});
  };

  const handleCheckForUpdates = () => {
    setUpdateStatus('checking');
    setUpdateError(null);
    setUpdateInfo(null);
    invoke<{ available: boolean; version: string | null; body: string | null }>('check_for_updates')
      .then((result) => {
        if (result.available && result.version) {
          setUpdateInfo({ version: result.version, body: result.body ?? null });
          setUpdateStatus('available');
        } else {
          setUpdateStatus('up-to-date');
        }
      })
      .catch((err: unknown) => {
        setUpdateError(typeof err === 'string' ? err : 'Update check failed');
        setUpdateStatus('error');
      });
  };

  const handleInstallUpdate = () => {
    setUpdateStatus('installing');
    invoke('install_update')
      .catch((err: unknown) => {
        setUpdateError(typeof err === 'string' ? err : 'Install failed');
        setUpdateStatus('error');
      });
  };

  useEffect(() => {
    if (activeTab === 'triggers') {
      setTabLoading(true);
      invoke<Trigger[]>('list_triggers').then(setTriggers).catch(() => {}).finally(() => setTabLoading(false));
    } else if (activeTab === 'audit') {
      setTabLoading(true);
      invoke<AuditEntry[]>('get_audit_log', { limit: 100 }).then(setAuditLog).catch(() => {}).finally(() => setTabLoading(false));
    } else if (activeTab === 'history') {
      setTabLoading(true);
      invoke<RunRecord[]>('list_runs', { limit: 50 }).then(setRuns).catch(() => {}).finally(() => setTabLoading(false));
    }
  }, [activeTab]);

  const checkOllama = (baseUrl: string) => {
    setOllamaChecking(true);
    invoke<OllamaStatus>('ollama_status', { baseUrl })
      .then(setOllamaStatus)
      .catch(() => setOllamaStatus({ running: false, models: [] }))
      .finally(() => setOllamaChecking(false));
  };

  useEffect(() => {
    if (activeTab === 'general' && settings.provider === 'ollama') {
      checkOllama(settings.ollamaBaseUrl);
    }
  }, [activeTab, settings.provider, settings.ollamaBaseUrl]);

  const handlePullModel = () => {
    setPulling(true);
    setPullMessage(null);
    invoke<string>('ollama_pull', { baseUrl: settings.ollamaBaseUrl, model: settings.model })
      .then((message) => {
        setPullMessage(message);
        checkOllama(settings.ollamaBaseUrl);
      })
      .catch((error) => setPullMessage(String(error)))
      .finally(() => setPulling(false));
  };

  const handleSaveKey = () => {
    const key = openaiKeyInput.trim();
    if (!key) return;
    setSavingKey(true);
    setSaveKeySuccess(false);
    setTestResult(null);
    invoke('set_api_key', { provider: 'openai', key })
      .then(() => {
        setOpenaiKeyInput('');
        refreshKeyStatus();
        setSaveKeySuccess(true);
        setTimeout(() => setSaveKeySuccess(false), 2500);
      })
      .catch(() => {})
      .finally(() => setSavingKey(false));
  };

  const handleClearKey = () => {
    setTestResult(null);
    invoke('remove_api_key', { provider: 'openai' })
      .then(refreshKeyStatus)
      .catch(() => {});
  };

  const handleSaveAnthropicKey = () => {
    const key = anthropicKeyInput.trim();
    if (!key) return;
    setSavingKey(true);
    setSaveKeySuccess(false);
    setTestResult(null);
    invoke('set_api_key', { provider: 'anthropic', key })
      .then(() => {
        setAnthropicKeyInput('');
        refreshKeyStatus();
        setSaveKeySuccess(true);
        setTimeout(() => setSaveKeySuccess(false), 2500);
      })
      .catch(() => {})
      .finally(() => setSavingKey(false));
  };

  const handleClearAnthropicKey = () => {
    setTestResult(null);
    invoke('remove_api_key', { provider: 'anthropic' })
      .then(refreshKeyStatus)
      .catch(() => {});
  };

  const handleSaveOpenrouterKey = () => {
    const key = openrouterKeyInput.trim();
    if (!key) return;
    setSavingKey(true);
    setSaveKeySuccess(false);
    setTestResult(null);
    invoke('set_api_key', { provider: 'openrouter', key })
      .then(() => {
        setOpenrouterKeyInput('');
        refreshKeyStatus();
        setSaveKeySuccess(true);
        setTimeout(() => setSaveKeySuccess(false), 2500);
      })
      .catch(() => {})
      .finally(() => setSavingKey(false));
  };

  const handleClearOpenrouterKey = () => {
    setTestResult(null);
    invoke('remove_api_key', { provider: 'openrouter' })
      .then(refreshKeyStatus)
      .catch(() => {});
  };

  const handleSaveSystemPrompt = () => {
    setSavingSystemPrompt(true);
    setSystemPromptSaved(false);
    invoke('save_system_prompt', { prompt: systemPromptInput })
      .then(() => {
        setSystemPrompt(systemPromptInput);
        setSystemPromptSaved(true);
        setTimeout(() => setSystemPromptSaved(false), 2500);
      })
      .catch(() => {})
      .finally(() => setSavingSystemPrompt(false));
  };

  const handleResetSystemPrompt = () => {
    invoke('save_system_prompt', { prompt: '' })
      .then(() => invoke<string>('get_system_prompt'))
      .then((t) => { setSystemPrompt(t); setSystemPromptInput(t); })
      .catch(() => {});
  };

  const handleTestConnection = () => {
    setTesting(true);
    setTestResult(null);
    invoke<string>('test_provider_connection', {
      provider: settings.provider,
      model: settings.model,
      ollamaBaseUrl: settings.ollamaBaseUrl,
    })
      .then((message) => setTestResult({ ok: true, message }))
      .catch((error) => setTestResult({ ok: false, message: String(error) }))
      .finally(() => setTesting(false));
  };

  const persistSettings = (next: AppSettings) => {
    setSettings(next);
    invoke('save_settings', { settings: next }).catch(() => {});
  };

  const persistSecurity = (security: SecuritySettings) => {
    persistSettings({ ...settings, security });
  };

  const handleProviderChange = (provider: string) => {
    setTestResult(null);
    persistSettings({ ...settings, provider, model: DEFAULT_MODELS[provider] ?? settings.model });
  };

  const refreshTriggers = () => {
    invoke<Trigger[]>('list_triggers').then(setTriggers).catch(() => {});
  };

  const handleCreateTrigger = () => {
    if (!newTrigger.name.trim() || !newTrigger.payload.trim()) return;
    const trigger: Trigger = {
      ...newTrigger,
      id: `trg-${Date.now()}`,
      intervalSecs: newTrigger.intervalSecs && newTrigger.intervalSecs > 0 ? newTrigger.intervalSecs : null,
      watchPath: newTrigger.watchPath && newTrigger.watchPath.trim() ? newTrigger.watchPath.trim() : null,
    };
    invoke('create_trigger', { trigger })
      .then(() => {
        refreshTriggers();
        setNewTrigger({ id: '', name: '', kind: 'prompt', payload: '', intervalSecs: null, watchPath: null, enabled: true });
      })
      .catch(() => {});
  };

  const handleDeleteTrigger = (id: string) => {
    invoke('delete_trigger', { id }).then(refreshTriggers).catch(() => {});
  };

  const handleToggleTrigger = (id: string, enabled: boolean) => {
    invoke('set_trigger_enabled', { id, enabled }).then(refreshTriggers).catch(() => {});
  };

  const filteredPermissions = selectedCategory 
    ? PERMISSIONS.filter(p => p.category === selectedCategory)
    : PERMISSIONS;

  const getStatusText = (status: Permission['status']) => {
    switch (status) {
      case 'granted':
        return 'Granted';
      case 'denied':
        return 'Denied';
      case 'unknown':
        return 'Unknown';
    }
  };

  const TABS = [
    { id: 'permissions', label: 'Permissions', icon: Shield },
    { id: 'general', label: 'General', icon: SettingsIcon },
    { id: 'security', label: 'Security', icon: ShieldAlert },
    { id: 'triggers', label: 'Triggers', icon: Clock },
    { id: 'audit', label: 'Audit', icon: ScrollText },
    { id: 'history', label: 'History', icon: HistoryIcon },
  ] as const;

  return (
    <div
      className="relative mt-2 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col h-[520px] border border-white/10"
      style={{
        background: 'linear-gradient(180deg, rgba(22,22,26,0.92) 0%, rgba(10,10,12,0.96) 100%)',
        boxShadow: '0 24px 70px -24px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)',
        backdropFilter: 'blur(48px)',
        WebkitBackdropFilter: 'blur(48px)',
      }}
    >
      {/* Ambient brand glows */}
      <div
        className="pointer-events-none absolute -top-28 -left-24 h-64 w-64 rounded-full blur-3xl opacity-30"
        style={{ background: 'radial-gradient(circle, #FF8918 0%, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-28 -right-24 h-64 w-64 rounded-full blur-3xl opacity-25"
        style={{ background: 'radial-gradient(circle, #0098f3 0%, transparent 70%)' }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-xl border border-white/10"
            style={{ background: 'linear-gradient(135deg, rgba(255,137,24,0.25), rgba(0,152,243,0.18))' }}
          >
            <Shield className="h-3.5 w-3.5 text-white/90" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight text-white">Settings</h3>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 transition"
          title="Close (ESC)"
        >
          <X className="h-3.5 w-3.5 text-white/60" />
        </button>
      </div>

      {/* Tabs */}
      <div className="relative z-10 px-3 pt-3">
        <div className="flex gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-all ${
                  active
                    ? 'bg-white/[0.10] text-white border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                    : 'text-white/50 hover:text-white/90 hover:bg-white/[0.05] border border-transparent'
                }`}
              >
                <tab.icon className="h-3 w-3" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-hidden flex flex-col">
        {activeTab === 'permissions' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Categories Sidebar */}
            <div className="w-40 border-r border-white/[0.08] p-3 flex flex-col">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-2 px-1">Categories</h3>
              <div className="flex-1 overflow-y-auto space-y-1">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all flex items-center gap-2 ${
                    selectedCategory === null
                      ? 'bg-white/[0.08] text-white border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
                      : 'text-white/55 hover:text-white/90 hover:bg-white/[0.05] border border-transparent'
                  }`}
                >
                  <span className="flex-1 text-[11px]">All</span>
                  <span className="text-[10px] text-white/35">{PERMISSIONS.length}</span>
                </button>
                {Object.entries(CATEGORIES).map(([key, category]) => {
                  const count = PERMISSIONS.filter(p => p.category === key).length;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedCategory(key)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all flex items-center gap-2 ${
                        selectedCategory === key
                          ? 'bg-white/[0.08] text-white border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
                          : 'text-white/55 hover:text-white/90 hover:bg-white/[0.05] border border-transparent'
                      }`}
                    >
                      <category.icon className="h-3.5 w-3.5 flex-shrink-0 opacity-80" />
                      <span className="flex-1 text-[11px] truncate">{category.name}</span>
                      <span className="text-[10px] text-white/35">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Permissions List */}
            <div className="flex-1 overflow-y-auto p-3.5">
              <div className="space-y-2">
                {filteredPermissions.map((permission) => (
                  <div
                    key={permission.id}
                    className={`group rounded-xl px-3.5 py-3 border transition-all hover:bg-white/[0.04] ${
                      permission.status === 'denied'
                        ? 'bg-red-500/[0.06] border-red-500/20'
                        : 'bg-white/[0.025] border-white/[0.08]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 border border-white/10"
                        style={{
                          background:
                            permission.status === 'granted'
                              ? 'linear-gradient(135deg, rgba(34,197,94,0.22), rgba(34,197,94,0.06))'
                              : permission.status === 'denied'
                              ? 'linear-gradient(135deg, rgba(239,68,68,0.22), rgba(239,68,68,0.06))'
                              : 'linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))',
                        }}
                      >
                        <permission.icon className={`h-4 w-4 ${
                          permission.status === 'granted'
                            ? 'text-green-400'
                            : permission.status === 'denied'
                            ? 'text-red-400'
                            : 'text-white/60'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-medium text-white/95 truncate">{permission.name}</span>
                          {permission.required && (
                            <span className="px-1.5 py-0.5 bg-white/[0.08] text-white/45 text-[9px] rounded-md uppercase tracking-wider flex-shrink-0">
                              req
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/40 truncate mt-0.5">{permission.description}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border ${
                          permission.status === 'granted'
                            ? 'bg-green-500/10 text-green-400 border-green-500/20'
                            : permission.status === 'denied'
                            ? 'bg-red-500/10 text-red-400 border-red-500/20'
                            : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                        }`}>
                          {permission.status === 'granted'
                            ? <CheckCircle className="h-3 w-3" />
                            : permission.status === 'denied'
                            ? <XCircle className="h-3 w-3" />
                            : <AlertTriangle className="h-3 w-3" />
                          }
                          <span>{getStatusText(permission.status)}</span>
                        </div>
                        {permission.status !== 'granted' && permission.settingsKind && (
                          <button
                            onClick={() => invoke('open_permission_settings', { kind: permission.settingsKind })}
                            className="px-2.5 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] text-white/80 text-[10px] font-medium rounded-lg border border-white/10 transition-all whitespace-nowrap active:scale-95"
                          >
                            Open Settings
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div
                className="mt-5 rounded-xl p-4 border border-white/[0.08]"
                style={{ background: 'linear-gradient(135deg, rgba(255,137,24,0.06), rgba(0,152,243,0.06))' }}
              >
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/55 mb-3 flex items-center gap-2">
                  <Shield className="h-3 w-3" />
                  Permission Summary
                </h3>
                <div className="grid grid-cols-3 gap-2.5 text-[10px]">
                  <div className="text-center py-2.5 bg-green-500/[0.08] rounded-lg border border-green-500/20">
                    <div className="text-green-400 font-semibold text-lg leading-none">
                      {PERMISSIONS.filter(p => p.status === 'granted').length}
                    </div>
                    <div className="text-white/50 mt-1">Granted</div>
                  </div>
                  <div className="text-center py-2.5 bg-red-500/[0.08] rounded-lg border border-red-500/20">
                    <div className="text-red-400 font-semibold text-lg leading-none">
                      {PERMISSIONS.filter(p => p.status === 'denied').length}
                    </div>
                    <div className="text-white/50 mt-1">Denied</div>
                  </div>
                  <div className="text-center py-2.5 bg-yellow-500/[0.08] rounded-lg border border-yellow-500/20">
                    <div className="text-yellow-400 font-semibold text-lg leading-none">
                      {PERMISSIONS.filter(p => p.status === 'unknown').length}
                    </div>
                    <div className="text-white/50 mt-1">Unknown</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'general' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            <div>
              <h3 className="text-xs font-medium text-white/80 mb-2 flex items-center gap-2">
                <Bot className="h-3 w-3" />
                AI Provider
              </h3>
              <div className="flex gap-2 flex-wrap">
                {(['openai', 'anthropic', 'openrouter', 'ollama'] as const).map((provider) => (
                  <button
                    key={provider}
                    onClick={() => handleProviderChange(provider)}
                    className={`px-3 py-2 rounded text-xs transition-colors border ${
                      settings.provider === provider
                        ? 'bg-white/10 text-white border-blue-500/50'
                        : 'text-white/60 hover:text-white/80 hover:bg-white/5 border-white/10'
                    }`}
                  >
                    {provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic' : provider === 'openrouter' ? 'OpenRouter' : 'Ollama (local)'}
                  </button>
                ))}
              </div>
            </div>

            {settings.provider === 'ollama' && (
              <div className="bg-white/5 rounded p-2 border border-white/5">
                {ollamaChecking ? (
                  <div className="flex items-center gap-2 text-[11px] text-white/60">
                    <Spinner size="xs" />
                    Checking Ollama…
                  </div>
                ) : ollamaStatus?.running ? (
                  <div className="flex items-center gap-2 text-[11px] text-green-400">
                    <CheckCircle className="h-3 w-3" />
                    Ollama running ({ollamaStatus.models.length} model{ollamaStatus.models.length === 1 ? '' : 's'})
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-3 w-3 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <div className="text-[10px] text-white/60 leading-relaxed">
                      <span className="text-yellow-400">Ollama not detected at {settings.ollamaBaseUrl}.</span>
                      {' '}Install from ollama.com and run <span className="font-medium text-white/80">ollama serve</span>.
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-white/80 mb-2 block">Model</label>
              {PROVIDER_MODELS[settings.provider] && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {PROVIDER_MODELS[settings.provider].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => persistSettings({ ...settings, model: opt.id })}
                      className={`px-2 py-1 rounded text-[10px] border transition-colors ${
                        settings.model === opt.id
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                          : 'bg-white/5 text-white/50 border-white/10 hover:text-white/70 hover:bg-white/8'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
              {settings.provider === 'ollama' && ollamaStatus?.running && ollamaStatus.models.length > 0 && (
                <select
                  value={ollamaStatus.models.includes(settings.model) ? settings.model : ''}
                  onChange={(e) => persistSettings({ ...settings, model: e.target.value })}
                  className="w-full mb-2 px-3 py-2 rounded bg-white/5 border border-white/10 text-xs text-white/90 focus:outline-none focus:border-blue-500/50"
                >
                  <option value="" className="bg-black">Select installed model…</option>
                  {ollamaStatus.models.map((model) => (
                    <option key={model} value={model} className="bg-black">
                      {model}{supportsToolCalling(model) ? ' · tools ✓' : ''}
                    </option>
                  ))}
                </select>
              )}
              <input
                type="text"
                value={settings.model}
                onChange={(e) => persistSettings({ ...settings, model: e.target.value })}
                placeholder={DEFAULT_MODELS[settings.provider] ?? ''}
                className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-xs text-white/90 placeholder-white/30 focus:outline-none focus:border-blue-500/50"
              />
              {settings.provider === 'openrouter' && (
                <p className="mt-1.5 text-[10px] text-white/40 leading-relaxed">
                  Any OpenRouter model slug — see <span className="text-white/60">openrouter.ai/models</span> for the full list.
                </p>
              )}
              {settings.provider === 'ollama' && settings.model.trim() !== '' && (
                <div className="mt-2 flex items-center gap-2">
                  <ToolCallingBadge model={settings.model} />
                  {!supportsToolCalling(settings.model) && (
                    <span className="text-[10px] text-white/40 leading-relaxed">
                      heuristic — may still work, but tool calling isn’t guaranteed.
                    </span>
                  )}
                </div>
              )}
              {settings.provider === 'ollama' && (
                <p className="mt-1.5 text-[10px] text-white/40 leading-relaxed">
                  Tool-calling requires a tool-capable model. Recommended: {RECOMMENDED_TOOL_MODELS.join(', ')}. Models without tool support will return an error.
                </p>
              )}
              {settings.provider === 'ollama' && ollamaStatus?.running && settings.model.trim() !== '' && !ollamaStatus.models.includes(settings.model) && (
                <div className="mt-2">
                  <button
                    onClick={handlePullModel}
                    disabled={pulling}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-blue-400 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                  >
                    {pulling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                    {pulling ? `Pulling ${settings.model}…` : `Pull model "${settings.model}"`}
                  </button>
                  {pullMessage && (
                    <p className="mt-1.5 text-[10px] text-white/50 leading-relaxed">{pullMessage}</p>
                  )}
                </div>
              )}
            </div>

            {settings.provider === 'ollama' && (
              <div>
                <label className="text-xs font-medium text-white/80 mb-2 block">Ollama Base URL</label>
                <input
                  type="text"
                  value={settings.ollamaBaseUrl}
                  onChange={(e) => persistSettings({ ...settings, ollamaBaseUrl: e.target.value })}
                  placeholder="http://localhost:11434"
                  className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-xs text-white/90 placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                />
              </div>
            )}

            {settings.provider === 'openai' && (
              <div>
                <label className="text-xs font-medium text-white/80 mb-2 flex items-center gap-2">
                  <Key className="h-3 w-3" />
                  OpenAI API Key
                </label>
                {openaiKeySet && (
                  <div className="flex items-center justify-between gap-2 mb-2 bg-white/5 rounded p-2 border border-white/5">
                    <div className="flex items-center gap-2 text-[11px] text-green-400">
                      <CheckCircle className="h-3 w-3" />
                      API key configured
                    </div>
                    <button
                      onClick={handleClearKey}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    autoComplete="off"
                    value={openaiKeyInput}
                    onChange={(e) => setOpenaiKeyInput(e.target.value)}
                    placeholder={openaiKeySet ? 'Enter a new key to replace…' : 'sk-…'}
                    className="flex-1 px-3 py-2 rounded bg-white/5 border border-white/10 text-xs text-white/90 placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                  />
                  <button
                    onClick={handleSaveKey}
                    disabled={savingKey || openaiKeyInput.trim() === ''}
                    className="flex items-center gap-1 px-3 py-2 rounded text-xs text-blue-400 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors disabled:opacity-40"
                  >
                    {savingKey ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Save
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] text-white/40 leading-relaxed">
                  Stored securely in your macOS keychain — never written to settings.
                </p>
                {saveKeySuccess && (
                  <StatusMessage type="success" message="API key saved." className="mt-2" />
                )}
              </div>
            )}

            {settings.provider === 'anthropic' && (
              <div>
                <label className="text-xs font-medium text-white/80 mb-2 flex items-center gap-2">
                  <Key className="h-3 w-3" />
                  Anthropic API Key
                </label>
                {anthropicKeySet && (
                  <div className="flex items-center justify-between gap-2 mb-2 bg-white/5 rounded p-2 border border-white/5">
                    <div className="flex items-center gap-2 text-[11px] text-green-400">
                      <CheckCircle className="h-3 w-3" />
                      API key configured
                    </div>
                    <button
                      onClick={handleClearAnthropicKey}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    autoComplete="off"
                    value={anthropicKeyInput}
                    onChange={(e) => setAnthropicKeyInput(e.target.value)}
                    placeholder={anthropicKeySet ? 'Enter a new key to replace…' : 'sk-ant-…'}
                    className="flex-1 px-3 py-2 rounded bg-white/5 border border-white/10 text-xs text-white/90 placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                  />
                  <button
                    onClick={handleSaveAnthropicKey}
                    disabled={savingKey || anthropicKeyInput.trim() === ''}
                    className="flex items-center gap-1 px-3 py-2 rounded text-xs text-blue-400 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors disabled:opacity-40"
                  >
                    {savingKey ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Save
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] text-white/40 leading-relaxed">
                  Stored securely in your macOS keychain — never written to settings.
                </p>
                {saveKeySuccess && (
                  <StatusMessage type="success" message="API key saved." className="mt-2" />
                )}
              </div>
            )}

            {settings.provider === 'openrouter' && (
              <div>
                <label className="text-xs font-medium text-white/80 mb-2 flex items-center gap-2">
                  <Key className="h-3 w-3" />
                  OpenRouter API Key
                </label>
                {openrouterKeySet && (
                  <div className="flex items-center justify-between gap-2 mb-2 bg-white/5 rounded p-2 border border-white/5">
                    <div className="flex items-center gap-2 text-[11px] text-green-400">
                      <CheckCircle className="h-3 w-3" />
                      API key configured
                    </div>
                    <button
                      onClick={handleClearOpenrouterKey}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    autoComplete="off"
                    value={openrouterKeyInput}
                    onChange={(e) => setOpenrouterKeyInput(e.target.value)}
                    placeholder={openrouterKeySet ? 'Enter a new key to replace…' : 'sk-or-…'}
                    className="flex-1 px-3 py-2 rounded bg-white/5 border border-white/10 text-xs text-white/90 placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                  />
                  <button
                    onClick={handleSaveOpenrouterKey}
                    disabled={savingKey || openrouterKeyInput.trim() === ''}
                    className="flex items-center gap-1 px-3 py-2 rounded text-xs text-blue-400 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors disabled:opacity-40"
                  >
                    {savingKey ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Save
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] text-white/40 leading-relaxed">
                  Get your key at <span className="text-white/60">openrouter.ai/keys</span>. Stored securely in your macOS keychain.
                </p>
                {saveKeySuccess && (
                  <StatusMessage type="success" message="API key saved." className="mt-2" />
                )}
              </div>
            )}

            <div>
              <button
                onClick={handleTestConnection}
                disabled={testing}
                className="flex items-center gap-1.5 px-3 py-2 rounded text-xs text-white/80 border border-white/15 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plug className="h-3 w-3" />}
                {testing ? 'Testing…' : 'Test connection'}
              </button>
              {testResult && (
                <StatusMessage
                  type={testResult.ok ? 'success' : 'error'}
                  message={testResult.message}
                  className="mt-2"
                />
              )}
            </div>

            <div className="pt-2 border-t border-white/10">
              <h3 className="text-xs font-medium text-white/80 mb-2 flex items-center gap-2">
                <FileText className="h-3 w-3" />
                System Prompt
              </h3>
              <p className="text-[10px] text-white/40 mb-3 leading-relaxed">
                Customize the AI system prompt. Edit and save to override the bundled default. Leave empty to reset to default.
              </p>
              <textarea
                value={systemPromptInput}
                onChange={(e) => setSystemPromptInput(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-xs text-white/90 placeholder-white/30 focus:outline-none focus:border-blue-500/50 font-mono resize-y"
                placeholder="System prompt template…"
                spellCheck={false}
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={handleSaveSystemPrompt}
                  disabled={savingSystemPrompt || systemPromptInput === systemPrompt}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-blue-400 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors disabled:opacity-40"
                >
                  {savingSystemPrompt ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Save
                </button>
                <button
                  onClick={handleResetSystemPrompt}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-white/60 border border-white/10 hover:bg-white/5 transition-colors"
                  title="Reset to bundled default"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset to default
                </button>
                {systemPromptSaved && (
                  <StatusMessage type="success" message="Saved." className="ml-1" />
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-white/10">
              <h3 className="text-xs font-medium text-white/80 mb-2 flex items-center gap-2">
                <Gauge className="h-3 w-3" />
                Budget
              </h3>
              <p className="text-[10px] text-white/40 mb-3 leading-relaxed">
                Per-task safety limits. The agent loop stops once either limit is reached to avoid runaway cost.
              </p>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[11px] text-white/70 mb-1 block">Max steps</label>
                  <input
                    type="number"
                    min={1}
                    value={settings.maxStepsPerSession}
                    onChange={(e) => persistSettings({ ...settings, maxStepsPerSession: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-xs text-white/90 focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] text-white/70 mb-1 block">Max cost (USD)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.05}
                    value={settings.maxCostUsdPerSession}
                    onChange={(e) => persistSettings({ ...settings, maxCostUsdPerSession: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-xs text-white/90 focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>
              <p className="mt-1.5 text-[10px] text-white/40 leading-relaxed">
                Cost is an approximate estimate from input-token usage (OpenAI models only); set 0 for unlimited.
              </p>
            </div>

            <div className="pt-2 border-t border-white/10">
              <h3 className="text-xs font-medium text-white/80 mb-2 flex items-center gap-2">
                <FileText className="h-3 w-3" />
                Diagnostics
              </h3>
              <p className="text-[10px] text-white/40 mb-2 leading-relaxed">
                Errors and crashes are written to a local log file. Open it to help with troubleshooting.
              </p>
              <button
                onClick={handleOpenLogs}
                className="flex items-center gap-1.5 px-3 py-2 rounded text-xs text-white/80 border border-white/15 bg-white/5 hover:bg-white/10 transition-colors"
              >
                <FolderOpen className="h-3 w-3" />
                Open logs
              </button>
              {logPath && (
                <p className="mt-2 text-[10px] text-white/30 leading-relaxed break-all">{logPath}</p>
              )}
            </div>

            <div className="pt-2 border-t border-white/10">
              <h3 className="text-xs font-medium text-white/80 mb-2 flex items-center gap-2">
                <Download className="h-3 w-3" />
                Updates
              </h3>
              <p className="text-[10px] text-white/40 mb-2 leading-relaxed">
                Check for a new version of openMOON.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleCheckForUpdates}
                  disabled={updateStatus === 'checking' || updateStatus === 'installing'}
                  className="flex items-center gap-1.5 px-3 py-2 rounded text-xs text-white/80 border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {updateStatus === 'checking' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  Check for updates
                </button>
                {updateStatus === 'available' && updateInfo && (
                  <button
                    onClick={handleInstallUpdate}
                    className="flex items-center gap-1.5 px-3 py-2 rounded text-xs text-blue-400 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
                  >
                    <Download className="h-3 w-3" />
                    Install v{updateInfo.version}
                  </button>
                )}
              </div>
              {updateStatus === 'up-to-date' && (
                <p className="mt-2 text-[10px] text-green-400/80">Up to date</p>
              )}
              {updateStatus === 'available' && updateInfo && (
                <p className="mt-2 text-[10px] text-blue-400/80">
                  Update available: v{updateInfo.version}
                  {updateInfo.body ? ` — ${updateInfo.body}` : ''}
                </p>
              )}
              {updateStatus === 'installing' && (
                <p className="mt-2 text-[10px] text-white/50">Downloading and installing…</p>
              )}
              {updateStatus === 'error' && updateError && (
                <p className="mt-2 text-[10px] text-red-400/80">{updateError}</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            <div>
              <h3 className="text-xs font-medium text-white/80 mb-2 flex items-center gap-2">
                <ShieldAlert className="h-3 w-3" />
                Default policy
              </h3>
              <p className="text-[10px] text-white/40 mb-2 leading-relaxed">
                Applied to tools without a category default or explicit override.
              </p>
              <div className="flex gap-2">
                {POLICY_OPTIONS.map((policy) => (
                  <button
                    key={policy}
                    onClick={() => persistSecurity({ ...settings.security, globalDefault: policy })}
                    className={`flex-1 px-3 py-2 rounded text-xs capitalize transition-colors border ${
                      settings.security.globalDefault === policy
                        ? 'bg-white/10 text-white border-blue-500/50'
                        : 'text-white/60 hover:text-white/80 hover:bg-white/5 border-white/10'
                    }`}
                  >
                    {policy}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-medium text-white/80 mb-2">Per-tool overrides</h3>
              <div className="space-y-2">
                {Object.entries(settings.security.toolOverrides).map(([tool, policy]) => (
                  <div key={tool} className="flex items-center gap-2">
                    <span className="flex-1 text-xs text-white/70 truncate">{tool}</span>
                    <select
                      value={policy}
                      onChange={(e) => persistSecurity({
                        ...settings.security,
                        toolOverrides: { ...settings.security.toolOverrides, [tool]: e.target.value },
                      })}
                      className="px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white/90 focus:outline-none focus:border-blue-500/50"
                    >
                      {POLICY_OPTIONS.map((p) => (
                        <option key={p} value={p} className="bg-black">{p}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const next = { ...settings.security.toolOverrides };
                        delete next[tool];
                        persistSecurity({ ...settings.security, toolOverrides: next });
                      }}
                      className="p-1 rounded hover:bg-white/10 transition-colors"
                    >
                      <Trash2 className="h-3 w-3 text-white/50" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={newOverrideTool}
                  onChange={(e) => setNewOverrideTool(e.target.value)}
                  placeholder="tool name (e.g. write_file)"
                  className="flex-1 px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white/90 placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                />
                <button
                  onClick={() => {
                    const tool = newOverrideTool.trim();
                    if (!tool) return;
                    persistSecurity({
                      ...settings.security,
                      toolOverrides: { ...settings.security.toolOverrides, [tool]: 'ask' },
                    });
                    setNewOverrideTool('');
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-white/70 border border-white/10 hover:bg-white/5 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-medium text-white/80 mb-2 flex items-center gap-2">
                <FolderOpen className="h-3 w-3" />
                Allowed paths
              </h3>
              <p className="text-[10px] text-white/40 mb-2 leading-relaxed">
                Filesystem tools are limited to your home folder and the openMOON config dir. Add extra directories here.
              </p>
              <div className="space-y-2">
                {settings.security.allowedPaths.map((path, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="flex-1 text-xs text-white/70 truncate">{path}</span>
                    <button
                      onClick={() => persistSecurity({
                        ...settings.security,
                        allowedPaths: settings.security.allowedPaths.filter((_, i) => i !== index),
                      })}
                      className="p-1 rounded hover:bg-white/10 transition-colors"
                    >
                      <Trash2 className="h-3 w-3 text-white/50" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={newAllowedPath}
                  onChange={(e) => setNewAllowedPath(e.target.value)}
                  placeholder="/path/to/allow"
                  className="flex-1 px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white/90 placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                />
                <button
                  onClick={() => {
                    const path = newAllowedPath.trim();
                    if (!path) return;
                    persistSecurity({
                      ...settings.security,
                      allowedPaths: [...settings.security.allowedPaths, path],
                    });
                    setNewAllowedPath('');
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-white/70 border border-white/10 hover:bg-white/5 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'triggers' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="space-y-2">
              {tabLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="sm" className="text-white/30" />
                </div>
              ) : triggers.length === 0 ? (
                <EmptyState icon={Clock} message="No triggers yet. Add one below." />
              ) : null}
              {triggers.map((trigger) => (
                <div key={trigger.id} className="bg-white/5 border border-white/10 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-white/90 truncate">{trigger.name}</span>
                        <span className="px-1.5 py-0.5 bg-white/10 text-white/50 text-[10px] rounded">{trigger.kind}</span>
                      </div>
                      <p className="text-[10px] text-white/50 mt-1 truncate">{trigger.payload}</p>
                      <p className="text-[10px] text-white/40 mt-0.5">
                        {trigger.intervalSecs ? `every ${trigger.intervalSecs}s` : ''}
                        {trigger.intervalSecs && trigger.watchPath ? ' · ' : ''}
                        {trigger.watchPath ? `watch ${trigger.watchPath}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleToggleTrigger(trigger.id, !trigger.enabled)}
                        className={`p-1 rounded hover:bg-white/10 transition-colors ${trigger.enabled ? 'text-green-400' : 'text-white/40'}`}
                        title={trigger.enabled ? 'Disable' : 'Enable'}
                      >
                        <Power className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteTrigger(trigger.id)}
                        className="p-1 rounded hover:bg-white/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3 text-white/50" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-3 space-y-2">
              <h3 className="text-xs font-medium text-white/80">New trigger</h3>
              <input
                type="text"
                value={newTrigger.name}
                onChange={(e) => setNewTrigger({ ...newTrigger, name: e.target.value })}
                placeholder="Name"
                className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white/90 placeholder-white/30 focus:outline-none focus:border-blue-500/50"
              />
              <div className="flex gap-2">
                {(['prompt', 'workflow'] as const).map((kind) => (
                  <button
                    key={kind}
                    onClick={() => setNewTrigger({ ...newTrigger, kind })}
                    className={`flex-1 px-2 py-1 rounded text-xs capitalize border transition-colors ${
                      newTrigger.kind === kind
                        ? 'bg-white/10 text-white border-blue-500/50'
                        : 'text-white/60 hover:bg-white/5 border-white/10'
                    }`}
                  >
                    {kind}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={newTrigger.payload}
                onChange={(e) => setNewTrigger({ ...newTrigger, payload: e.target.value })}
                placeholder={newTrigger.kind === 'workflow' ? 'workflow id' : 'natural-language prompt'}
                className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white/90 placeholder-white/30 focus:outline-none focus:border-blue-500/50"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  value={newTrigger.intervalSecs ?? ''}
                  onChange={(e) => setNewTrigger({ ...newTrigger, intervalSecs: e.target.value ? Number(e.target.value) : null })}
                  placeholder="interval (s)"
                  className="w-28 px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white/90 placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                />
                <input
                  type="text"
                  value={newTrigger.watchPath ?? ''}
                  onChange={(e) => setNewTrigger({ ...newTrigger, watchPath: e.target.value })}
                  placeholder="watch path (optional)"
                  className="flex-1 px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white/90 placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <button
                onClick={handleCreateTrigger}
                className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs text-blue-400 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add trigger
              </button>
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="flex-1 overflow-y-auto p-4">
            {tabLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="sm" className="text-white/30" />
              </div>
            ) : auditLog.length === 0 ? (
              <EmptyState icon={ScrollText} message="No audit entries yet." />
            ) : (
              <div className="space-y-1">
                {auditLog.map((entry, index) => (
                  <div key={index} className="flex items-center gap-2 text-[10px] py-1 border-b border-white/5">
                    {entry.ok ? (
                      <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
                    )}
                    <span className="text-white/70 w-32 truncate">{entry.tool}</span>
                    <span className="text-white/40 w-24 truncate">{entry.decision}</span>
                    <span className="text-white/40 flex-1 truncate">{entry.args_summary}</span>
                    <span className="text-white/30 flex-shrink-0">{entry.timestamp}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="flex-1 overflow-y-auto p-4">
            {tabLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="sm" className="text-white/30" />
              </div>
            ) : runs.length === 0 ? (
              <EmptyState icon={HistoryIcon} message="No session history yet. Completed agent runs will appear here." />
            ) : (
              <div className="space-y-2">
                {runs.map((run) => {
                  const isExpanded = expandedRunId === run.id;
                  const steps: { action: string; params: Record<string, unknown> }[] = (() => {
                    try { return JSON.parse(run.stepsJson) as { action: string; params: Record<string, unknown> }[]; } catch { return []; }
                  })();
                  return (
                    <div key={run.id} className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                      {/* Row header */}
                      <button
                        onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
                      >
                        {isExpanded
                          ? <ChevronDown className="h-3 w-3 text-white/40 flex-shrink-0" />
                          : <ChevronRight className="h-3 w-3 text-white/40 flex-shrink-0" />}
                        <span className="flex-1 text-[11px] text-white/80 truncate">{run.prompt}</span>
                        <span className="text-[10px] text-white/30 flex-shrink-0 mr-1">
                          {run.provider}/{run.model}
                        </span>
                        <span className="text-[10px] text-white/30 flex-shrink-0">{run.createdAt}</span>
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-2 border-t border-white/10">
                          <div className="pt-2">
                            <p className="text-[10px] text-white/50 mb-1 font-medium uppercase tracking-wide">Prompt</p>
                            <p className="text-[11px] text-white/80 whitespace-pre-wrap leading-relaxed">{run.prompt}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-white/50 mb-1 font-medium uppercase tracking-wide">Response</p>
                            <p className="text-[11px] text-white/70 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">{run.response}</p>
                          </div>
                          {steps.length > 0 && (
                            <div>
                              <p className="text-[10px] text-white/50 mb-1 font-medium uppercase tracking-wide">
                                Tool calls ({steps.length})
                              </p>
                              <div className="space-y-1">
                                {steps.map((step, i) => (
                                  <div key={i} className="flex items-start gap-2 text-[10px] bg-black/30 rounded px-2 py-1">
                                    <span className="text-blue-400 font-medium flex-shrink-0">{step.action}</span>
                                    <span className="text-white/40 truncate">
                                      {JSON.stringify(step.params)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-2 pt-1">
                            {onReplay && (
                              <button
                                onClick={() => { onReplay(run.prompt); onClose(); }}
                                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-blue-400 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Replay
                              </button>
                            )}
                            <button
                              onClick={() => {
                                invoke('delete_run', { id: run.id })
                                  .then(() => setRuns((prev) => prev.filter((r) => r.id !== run.id)))
                                  .catch(() => {});
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="relative z-10 px-4 py-2.5 border-t border-white/[0.08] bg-white/[0.02]">
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-white/40">
            {filteredPermissions.length} permissions
          </div>
          <div className="text-[10px] text-white/35">
            Click category to filter • ESC Close
          </div>
        </div>
      </div>
    </div>
  );
};
