import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  X, ArrowRight, ArrowLeft, CheckCircle, XCircle, Loader2, Key, Bot, Sparkles, AlertTriangle,
  ShieldCheck, Accessibility, Monitor,
} from 'lucide-react';
import { usePermissions, type PermissionKind } from '../hooks/usePermissions';
import { supportsToolCalling, RECOMMENDED_TOOL_MODELS } from '../utils/ollamaModels';

interface OnboardingProps {
  onComplete: () => void;
  onSkip: () => void;
}

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

interface OllamaStatus {
  running: boolean;
  models: string[];
}

/**
 * Ordered list of onboarding steps. Insert new steps (e.g. macOS permissions
 * between "provider" and "ready") by extending this array and adding a matching
 * case in `renderStep` — the navigation/progress logic adapts automatically.
 */
type StepId = 'welcome' | 'provider' | 'permissions' | 'ready';

const STEP_ORDER: StepId[] = ['welcome', 'provider', 'permissions', 'ready'];

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

export const Onboarding = ({ onComplete, onSkip }: OnboardingProps) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [provider, setProvider] = useState<'openai' | 'ollama'>('openai');
  const [model, setModel] = useState(DEFAULT_MODELS.openai);
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(DEFAULT_SETTINGS.ollamaBaseUrl);
  const [openaiKeyInput, setOpenaiKeyInput] = useState('');
  const [openaiKeySet, setOpenaiKeySet] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [ollamaChecking, setOllamaChecking] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStep = STEP_ORDER[stepIndex];
  const permissions = usePermissions(currentStep === 'permissions');

  useEffect(() => {
    invoke<AppSettings>('get_settings')
      .then((loaded) => {
        const merged = { ...DEFAULT_SETTINGS, ...loaded, security: { ...DEFAULT_SECURITY, ...loaded.security } };
        setSettings(merged);
        setProvider(merged.provider === 'ollama' ? 'ollama' : 'openai');
        setModel(merged.model);
        setOllamaBaseUrl(merged.ollamaBaseUrl);
      })
      .catch(() => {});
    invoke<boolean>('has_api_key_cmd', { provider: 'openai' })
      .then(setOpenaiKeySet)
      .catch(() => setOpenaiKeySet(false));
  }, []);

  const checkOllama = useCallback((baseUrl: string) => {
    setOllamaChecking(true);
    invoke<OllamaStatus>('ollama_status', { baseUrl })
      .then(setOllamaStatus)
      .catch(() => setOllamaStatus({ running: false, models: [] }))
      .finally(() => setOllamaChecking(false));
  }, []);

  useEffect(() => {
    if (currentStep === 'provider' && provider === 'ollama') {
      checkOllama(ollamaBaseUrl);
    }
  }, [currentStep, provider, ollamaBaseUrl, checkOllama]);

  const handleSelectProvider = (next: 'openai' | 'ollama') => {
    setError(null);
    setProvider(next);
    setModel(DEFAULT_MODELS[next] ?? '');
  };

  const goNext = () => setStepIndex((i) => Math.min(i + 1, STEP_ORDER.length - 1));
  const goBack = () => {
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  const handleProviderContinue = async () => {
    setError(null);

    if (provider === 'openai') {
      const key = openaiKeyInput.trim();
      if (key) {
        try {
          await invoke('set_api_key', { provider: 'openai', key });
          setOpenaiKeyInput('');
          setOpenaiKeySet(true);
        } catch (e) {
          setError(String(e));
          return;
        }
      } else if (!openaiKeySet) {
        setError('Paste your OpenAI API key to continue.');
        return;
      }
    } else if (!model.trim()) {
      setError('Select an installed Ollama model to continue.');
      return;
    }

    setValidating(true);
    try {
      await invoke<string>('test_provider_connection', { provider, model, ollamaBaseUrl });
      await invoke('save_settings', { settings: { ...settings, provider, model, ollamaBaseUrl } });
      goNext();
    } catch (e) {
      setError(String(e));
    } finally {
      setValidating(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-400/80" />
              <h2 className="text-base font-medium text-white/90">Welcome to openMOON</h2>
            </div>
            <p className="text-xs text-white/60 leading-relaxed">
              openMOON is an AI-powered launcher for macOS. Ask in natural language to control apps,
              files, and system functions — openMOON figures out the right tools and runs them for you.
            </p>
            <p className="text-xs text-white/50 leading-relaxed">
              Let’s connect an AI provider so you can start automating. It only takes a moment.
            </p>
          </div>
        );

      case 'provider':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-400/80" />
              <h2 className="text-base font-medium text-white/90">Choose a provider</h2>
            </div>

            <div className="flex gap-2">
              {(['openai', 'ollama'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => handleSelectProvider(p)}
                  className={`flex-1 px-3 py-2 rounded text-xs transition-colors border ${
                    provider === p
                      ? 'bg-white/10 text-white border-blue-500/50'
                      : 'text-white/60 hover:text-white/80 hover:bg-white/5 border-white/10'
                  }`}
                >
                  {p === 'openai' ? 'OpenAI' : 'Ollama (local)'}
                </button>
              ))}
            </div>

            {provider === 'openai' && (
              <div>
                <label className="text-xs font-medium text-white/80 mb-2 flex items-center gap-2">
                  <Key className="h-3 w-3" />
                  OpenAI API Key
                </label>
                {openaiKeySet && (
                  <div className="flex items-center gap-2 mb-2 text-[11px] text-green-400">
                    <CheckCircle className="h-3 w-3" />
                    API key already configured
                  </div>
                )}
                <input
                  type="password"
                  autoComplete="off"
                  value={openaiKeyInput}
                  onChange={(e) => setOpenaiKeyInput(e.target.value)}
                  placeholder={openaiKeySet ? 'Enter a new key to replace…' : 'sk-…'}
                  className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-xs text-white/90 placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                />
                <p className="mt-1.5 text-[10px] text-white/40 leading-relaxed">
                  Stored securely in your macOS keychain — never written to settings.
                </p>
              </div>
            )}

            {provider === 'ollama' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-white/80 mb-2 block">Ollama Base URL</label>
                  <input
                    type="text"
                    value={ollamaBaseUrl}
                    onChange={(e) => setOllamaBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-xs text-white/90 placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                  />
                </div>

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
                        <span className="text-yellow-400">Ollama not detected at {ollamaBaseUrl}.</span>
                        {' '}Install from ollama.com and run <span className="font-medium text-white/80">ollama serve</span>.
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-white/80 mb-2 block">Model</label>
                  {ollamaStatus?.running && ollamaStatus.models.length > 0 ? (
                    <select
                      value={ollamaStatus.models.includes(model) ? model : ''}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-xs text-white/90 focus:outline-none focus:border-blue-500/50"
                    >
                      <option value="" className="bg-black">Select installed model…</option>
                      {ollamaStatus.models.map((m) => (
                        <option key={m} value={m} className="bg-black">
                          {m}{supportsToolCalling(m) ? ' · tools ✓' : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={DEFAULT_MODELS.ollama}
                      className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-xs text-white/90 placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                    />
                  )}
                  {model.trim() !== '' && (
                    <div className="mt-2">
                      {supportsToolCalling(model) ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-green-400">
                          <CheckCircle className="h-3 w-3" />
                          tools ✓
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-yellow-400/90">
                          <AlertTriangle className="h-3 w-3" />
                          tools unknown — may not support tool calling
                        </span>
                      )}
                    </div>
                  )}
                  <p className="mt-1.5 text-[10px] text-white/40 leading-relaxed">
                    Tool-calling requires a tool-capable model. Recommended: {RECOMMENDED_TOOL_MODELS.join(', ')}.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded p-2 border border-red-500/20 bg-red-500/10 text-[11px] leading-relaxed text-red-400">
                <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        );

      case 'permissions': {
        const { status } = permissions;
        const rows: {
          kind: PermissionKind;
          icon: typeof Accessibility;
          title: string;
          desc: string;
          granted: boolean;
          requestable: boolean;
        }[] = [
          {
            kind: 'accessibility',
            icon: Accessibility,
            title: 'Accessibility',
            desc: 'Lets openMOON control apps and send keystrokes on your behalf.',
            granted: status.accessibility,
            requestable: true,
          },
          {
            kind: 'screen_recording',
            icon: Monitor,
            title: 'Screen Recording',
            desc: 'Needed to capture the screen and read what’s on your computer.',
            granted: status.screenRecording,
            requestable: true,
          },
        ];

        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-purple-400/80" />
              <h2 className="text-base font-medium text-white/90">Grant permissions</h2>
            </div>
            <p className="text-xs text-white/60 leading-relaxed">
              macOS gates app and computer control behind privacy permissions. Grant these so
              openMOON can act for you — you can change them anytime in System Settings.
            </p>

            <div className="space-y-2">
              {rows.map((row) => {
                const Icon = row.icon;
                return (
                  <div key={row.kind} className="rounded p-2.5 border border-white/10 bg-white/5">
                    <div className="flex items-start gap-2.5">
                      <Icon className="h-4 w-4 text-white/70 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-white/90">{row.title}</span>
                          {row.granted ? (
                            <span className="flex items-center gap-1 text-[10px] text-green-400">
                              <CheckCircle className="h-3 w-3" />
                              Granted
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] text-yellow-400/90">
                              <AlertTriangle className="h-3 w-3" />
                              Needed
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[10px] text-white/50 leading-relaxed">{row.desc}</p>
                        {!row.granted && (
                          <div className="mt-2 flex items-center gap-2">
                            {row.requestable && (
                              <button
                                onClick={() => permissions.request(row.kind)}
                                className="px-2 py-1 rounded text-[10px] text-blue-400 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
                              >
                                Grant access
                              </button>
                            )}
                            <button
                              onClick={() => permissions.openSettings(row.kind)}
                              className="px-2 py-1 rounded text-[10px] text-white/60 hover:text-white/90 hover:bg-white/5 transition-colors"
                            >
                              Open System Settings
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-[10px] text-white/40 leading-relaxed">
              Automation (controlling other apps) is approved by macOS the first time it’s used —
              there’s nothing to grant here in advance. You can continue without granting everything.
            </p>
          </div>
        );
      }

      case 'ready':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-400/90" />
              <h2 className="text-base font-medium text-white/90">You’re all set</h2>
            </div>
            <p className="text-xs text-white/60 leading-relaxed">
              Your provider is connected and ready. Type a request like
              <span className="text-white/80"> “take a screenshot”</span> or
              <span className="text-white/80"> “what’s my battery level”</span> to get started.
            </p>
            <p className="text-[10px] text-white/40 leading-relaxed">
              You can change providers, models, and permissions anytime in Settings.
            </p>
          </div>
        );
    }
  };

  const isProviderStep = currentStep === 'provider';
  const isLastStep = stepIndex === STEP_ORDER.length - 1;

  const handlePrimary = () => {
    if (isLastStep) {
      onComplete();
    } else if (isProviderStep) {
      handleProviderContinue();
    } else {
      goNext();
    }
  };

  return (
    <div className="mt-2 rounded-lg bg-black/95 border border-white/10 backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-1.5">
          {STEP_ORDER.map((id, i) => (
            <span
              key={id}
              className={`h-1.5 rounded-full transition-all ${
                i === stepIndex ? 'w-5 bg-blue-400/80' : i < stepIndex ? 'w-1.5 bg-green-400/70' : 'w-1.5 bg-white/20'
              }`}
            />
          ))}
        </div>
        <button
          onClick={onSkip}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
          title="Skip setup"
        >
          Skip
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">{renderStep()}</div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-white/10 bg-black/50 flex items-center justify-between">
        <button
          onClick={goBack}
          disabled={stepIndex === 0 || validating}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-white/60 hover:text-white/90 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </button>
        <button
          onClick={handlePrimary}
          disabled={validating}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-blue-400 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
        >
          {validating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {isLastStep ? 'Get started' : isProviderStep ? (validating ? 'Testing…' : 'Test & continue') : 'Continue'}
          {!isLastStep && !validating ? <ArrowRight className="h-3 w-3" /> : null}
        </button>
      </div>
    </div>
  );
};
