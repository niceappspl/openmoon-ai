import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ProviderSettings {
  provider: string;
  ollamaBaseUrl: string;
}

interface OllamaStatus {
  running: boolean;
  models: string[];
}

export interface ProviderStatus {
  /** True once the selected provider has usable credentials/reachability. */
  configured: boolean;
  /** Currently selected provider id (e.g. "openai", "ollama"). */
  provider: string;
  /** True while the initial/most recent check is in flight. */
  loading: boolean;
  /** Re-run the configured-ness check (after onboarding or settings changes). */
  refresh: () => void;
}

/**
 * Determines whether the selected AI provider is usable: an OpenAI key in the
 * keychain, or a reachable Ollama instance for the Ollama provider.
 */
export const useProviderStatus = (): ProviderStatus => {
  const [configured, setConfigured] = useState(true);
  const [provider, setProvider] = useState('openai');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await invoke<ProviderSettings>('get_settings');
      setProvider(settings.provider);

      if (settings.provider === 'ollama') {
        const status = await invoke<OllamaStatus>('ollama_status', { baseUrl: settings.ollamaBaseUrl });
        setConfigured(status.running);
      } else {
        const hasKey = await invoke<boolean>('has_api_key_cmd', { provider: 'openai' });
        setConfigured(hasKey);
      }
    } catch {
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { configured, provider, loading, refresh };
};
