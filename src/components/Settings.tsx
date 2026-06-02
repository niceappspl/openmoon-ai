import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Shield, Settings as SettingsIcon, Info, CheckCircle, XCircle, AlertTriangle, Bot, Cog, FolderOpen, Globe, Music, Headphones, Chrome, Video, Mic, MessageSquare, Wifi, Bluetooth, ShieldAlert, Clock, ScrollText, Plus, Trash2, Power, Download, Loader2 } from 'lucide-react';

interface SettingsProps {
  onClose: () => void;
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
};

const POLICY_OPTIONS: PolicyValue[] = ['auto', 'ask', 'deny'];

interface Permission {
  id: string;
  name: string;
  description: string;
  category: 'system' | 'apps' | 'files' | 'network' | 'media' | 'automation';
  required: boolean;
  status: 'granted' | 'denied' | 'unknown';
  instructions: string;
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
    instructions: 'System Preferences > Security & Privacy > Privacy > Automation > openMOON',
    icon: Bot
  },
  {
    id: 'system_events',
    name: 'System Events',
    description: 'System control, keyboard and mouse',
    category: 'automation',
    required: true,
    status: 'granted',
    instructions: 'System Preferences > Security & Privacy > Privacy > Accessibility > openMOON',
    icon: Cog
  },
  {
    id: 'finder_access',
    name: 'Finder Access',
    description: 'File management and trash operations',
    category: 'files',
    required: true,
    status: 'denied',
    instructions: 'System Preferences > Security & Privacy > Privacy > Files and Folders > openMOON > Documents Folder',
    icon: FolderOpen
  },
  {
    id: 'safari_automation',
    name: 'Safari Automation',
    description: 'Safari browser control',
    category: 'apps',
    required: false,
    status: 'unknown',
    instructions: 'System Preferences > Security & Privacy > Privacy > Automation > openMOON > Safari',
    icon: Globe
  },
  {
    id: 'music_automation',
    name: 'Music App Automation',
    description: 'Music app control',
    category: 'media',
    required: false,
    status: 'unknown',
    instructions: 'System Preferences > Security & Privacy > Privacy > Automation > openMOON > Music',
    icon: Music
  },
  {
    id: 'spotify_automation',
    name: 'Spotify Automation',
    description: 'Spotify app control',
    category: 'media',
    required: false,
    status: 'unknown',
    instructions: 'System Preferences > Security & Privacy > Privacy > Automation > openMOON > Spotify',
    icon: Headphones
  },
  {
    id: 'chrome_automation',
    name: 'Chrome Automation',
    description: 'Chrome browser control',
    category: 'apps',
    required: false,
    status: 'unknown',
    instructions: 'System Preferences > Security & Privacy > Privacy > Automation > openMOON > Google Chrome',
    icon: Chrome
  },
  {
    id: 'screen_recording',
    name: 'Screen Recording',
    description: 'Screen recording and screenshots',
    category: 'media',
    required: false,
    status: 'granted',
    instructions: 'System Preferences > Security & Privacy > Privacy > Screen Recording > openMOON',
    icon: Video
  },
  {
    id: 'microphone',
    name: 'Microphone Access',
    description: 'Microphone access for voice commands',
    category: 'system',
    required: false,
    status: 'granted',
    instructions: 'System Preferences > Security & Privacy > Privacy > Microphone > openMOON',
    icon: Mic
  },
  {
    id: 'speech_recognition',
    name: 'Speech Recognition',
    description: 'Speech recognition',
    category: 'system',
    required: false,
    status: 'granted',
    instructions: 'System Preferences > Security & Privacy > Privacy > Speech Recognition > openMOON',
    icon: MessageSquare
  },
  {
    id: 'network_access',
    name: 'Network Access',
    description: 'Network and internet access',
    category: 'network',
    required: true,
    status: 'granted',
    instructions: 'Automatically granted for applications',
    icon: Wifi
  },
  {
    id: 'bluetooth_control',
    name: 'Bluetooth Control',
    description: 'Bluetooth control (requires blueutil)',
    category: 'network',
    required: false,
    status: 'unknown',
    instructions: 'Install: brew install blueutil',
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

export const Settings = ({ onClose }: SettingsProps) => {
  const [activeTab, setActiveTab] = useState<'permissions' | 'general' | 'security' | 'triggers' | 'audit'>('permissions');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [newOverrideTool, setNewOverrideTool] = useState('');
  const [newAllowedPath, setNewAllowedPath] = useState('');
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [ollamaChecking, setOllamaChecking] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pullMessage, setPullMessage] = useState<string | null>(null);
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

  useEffect(() => {
    if (activeTab === 'triggers') {
      invoke<Trigger[]>('list_triggers').then(setTriggers).catch(() => {});
    } else if (activeTab === 'audit') {
      invoke<AuditEntry[]>('get_audit_log', { limit: 100 }).then(setAuditLog).catch(() => {});
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

  const persistSettings = (next: AppSettings) => {
    setSettings(next);
    invoke('save_settings', { settings: next }).catch(() => {});
  };

  const persistSecurity = (security: SecuritySettings) => {
    persistSettings({ ...settings, security });
  };

  const handleProviderChange = (provider: string) => {
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

  const getStatusIcon = (status: Permission['status']) => {
    switch (status) {
      case 'granted':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'denied':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'unknown':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

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

  const getStatusColor = (status: Permission['status']) => {
    switch (status) {
      case 'granted':
        return 'text-green-400';
      case 'denied':
        return 'text-red-400';
      case 'unknown':
        return 'text-yellow-400';
    }
  };

  return (
    <div className="mt-2 rounded-lg bg-black/95 border border-white/10 backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col h-[500px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-400/70" />
          <h3 className="text-sm font-medium text-white/90">Settings</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/5 transition-colors"
          title="Close (ESC)"
        >
          <X className="h-4 w-4 text-white/50" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setActiveTab('permissions')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'permissions'
              ? 'text-white border-b-2 border-blue-500 bg-white/5'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          <Shield className="h-3 w-3" />
          Permissions
        </button>
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'general'
              ? 'text-white border-b-2 border-blue-500 bg-white/5'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          <SettingsIcon className="h-3 w-3" />
          General
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'security'
              ? 'text-white border-b-2 border-blue-500 bg-white/5'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          <ShieldAlert className="h-3 w-3" />
          Security
        </button>
        <button
          onClick={() => setActiveTab('triggers')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'triggers'
              ? 'text-white border-b-2 border-blue-500 bg-white/5'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          <Clock className="h-3 w-3" />
          Triggers
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'audit'
              ? 'text-white border-b-2 border-blue-500 bg-white/5'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          <ScrollText className="h-3 w-3" />
          Audit
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'permissions' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Categories Sidebar */}
            <div className="w-36 border-r border-white/10 p-2 flex flex-col">
              <h3 className="text-xs font-medium text-white/80 mb-2">Categories</h3>
              <div className="flex-1 overflow-y-auto space-y-1">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors flex items-center gap-1 ${
                    selectedCategory === null
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                  }`}
                >
                  <span className="text-[10px]">All</span>
                  <span className="text-[10px] text-white/40">({PERMISSIONS.length})</span>
                </button>
                {Object.entries(CATEGORIES).map(([key, category]) => {
                  const count = PERMISSIONS.filter(p => p.category === key).length;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedCategory(key)}
                      className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors flex items-center gap-1 ${
                        selectedCategory === key
                          ? 'bg-white/10 text-white'
                          : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                      }`}
                    >
                      <category.icon className="h-3 w-3 flex-shrink-0" />
                      <span className="text-[10px] truncate">{category.name}</span>
                      <span className="text-[10px] text-white/40">({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Permissions List */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="space-y-3">
                {filteredPermissions.map((permission) => (
                  <div
                    key={permission.id}
                    className="bg-white/5 border border-white/10 rounded-lg p-3 hover:bg-white/8 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <permission.icon className="h-5 w-5 text-white/70 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-xs font-medium text-white/90 truncate">{permission.name}</h4>
                          {permission.required && (
                            <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded flex-shrink-0">
                              Required
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/60 mb-2 leading-relaxed">{permission.description}</p>
                        <div className="flex items-center gap-1 text-[10px] mb-2">
                          {getStatusIcon(permission.status)}
                          <span className={getStatusColor(permission.status)}>
                            {getStatusText(permission.status)}
                          </span>
                        </div>
                        
                        <div className="bg-white/5 rounded p-2 border border-white/5">
                          <div className="flex items-start gap-2">
                            <Info className="h-3 w-3 text-blue-400 mt-0.5 flex-shrink-0" />
                            <div className="text-[10px] text-white/50 leading-relaxed">
                              <span className="font-medium text-blue-400">How to grant:</span> {permission.instructions}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="mt-6 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <h3 className="text-xs font-medium text-blue-400 mb-3 flex items-center gap-2">
                  <Shield className="h-3 w-3" />
                  Permission Summary
                </h3>
                <div className="grid grid-cols-3 gap-3 text-[10px]">
                  <div className="text-center p-2 bg-green-500/10 rounded border border-green-500/20">
                    <div className="text-green-400 font-medium text-sm">
                      {PERMISSIONS.filter(p => p.status === 'granted').length}
                    </div>
                    <div className="text-white/60">Granted</div>
                  </div>
                  <div className="text-center p-2 bg-red-500/10 rounded border border-red-500/20">
                    <div className="text-red-400 font-medium text-sm">
                      {PERMISSIONS.filter(p => p.status === 'denied').length}
                    </div>
                    <div className="text-white/60">Denied</div>
                  </div>
                  <div className="text-center p-2 bg-yellow-500/10 rounded border border-yellow-500/20">
                    <div className="text-yellow-400 font-medium text-sm">
                      {PERMISSIONS.filter(p => p.status === 'unknown').length}
                    </div>
                    <div className="text-white/60">Unknown</div>
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
              <div className="flex gap-2">
                {(['openai', 'ollama'] as const).map((provider) => (
                  <button
                    key={provider}
                    onClick={() => handleProviderChange(provider)}
                    className={`flex-1 px-3 py-2 rounded text-xs transition-colors border ${
                      settings.provider === provider
                        ? 'bg-white/10 text-white border-blue-500/50'
                        : 'text-white/60 hover:text-white/80 hover:bg-white/5 border-white/10'
                    }`}
                  >
                    {provider === 'openai' ? 'OpenAI' : 'Ollama (local)'}
                  </button>
                ))}
              </div>
            </div>

            {settings.provider === 'ollama' && (
              <div className="bg-white/5 rounded p-2 border border-white/5">
                {ollamaChecking ? (
                  <div className="flex items-center gap-2 text-[11px] text-white/60">
                    <Loader2 className="h-3 w-3 animate-spin" />
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
              {settings.provider === 'ollama' && ollamaStatus?.running && ollamaStatus.models.length > 0 && (
                <select
                  value={ollamaStatus.models.includes(settings.model) ? settings.model : ''}
                  onChange={(e) => persistSettings({ ...settings, model: e.target.value })}
                  className="w-full mb-2 px-3 py-2 rounded bg-white/5 border border-white/10 text-xs text-white/90 focus:outline-none focus:border-blue-500/50"
                >
                  <option value="" className="bg-black">Select installed model…</option>
                  {ollamaStatus.models.map((model) => (
                    <option key={model} value={model} className="bg-black">{model}</option>
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
              {settings.provider === 'ollama' && (
                <p className="mt-1.5 text-[10px] text-white/40 leading-relaxed">
                  Tool-calling requires a tool-capable model (e.g. llama3.1, qwen2.5). Models without tool support will return an error.
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
              <div className="bg-white/5 rounded p-2 border border-white/5">
                <div className="flex items-start gap-2">
                  <Info className="h-3 w-3 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-[10px] text-white/50 leading-relaxed">
                    OpenAI uses the <span className="font-medium text-blue-400">OPENAI_API_KEY</span> environment variable.
                  </div>
                </div>
              </div>
            )}
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
              {triggers.length === 0 && (
                <p className="text-[11px] text-white/40">No triggers yet. Add one below.</p>
              )}
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
            {auditLog.length === 0 ? (
              <p className="text-[11px] text-white/40">No audit entries yet.</p>
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
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-white/10 bg-black/50">
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-white/40">
            {filteredPermissions.length} permissions
          </div>
          <div className="text-[10px] text-white/40">
            Click category to filter • ESC Close
          </div>
        </div>
      </div>
    </div>
  );
};
