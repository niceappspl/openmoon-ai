import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { countTokens, estimateTokensByChars, estimateCostUsd } from '../utils/tokens';

interface ProviderSettings {
  provider: string;
  model: string;
}

export interface TokenUsage {
  /** Estimated token count for the supplied text. */
  tokens: number;
  /** Approximate USD input cost, or `null` when not applicable. */
  costUsd: number | null;
}

/**
 * Live, debounced token count (and rough OpenAI cost) for arbitrary text such
 * as the current prompt plus conversation history. Reusable for later
 * per-session budget guards.
 */
export const useTokenCount = (text: string, debounceMs = 250): TokenUsage => {
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('');
  const [tokens, setTokens] = useState(0);

  useEffect(() => {
    invoke<ProviderSettings>('get_settings')
      .then((settings) => {
        setProvider(settings.provider);
        setModel(settings.model);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!text) {
      setTokens(0);
      return;
    }
    setTokens(estimateTokensByChars(text));
    let cancelled = false;
    const handle = setTimeout(() => {
      countTokens(text).then((count) => {
        if (!cancelled) setTokens(count);
      });
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [text, debounceMs]);

  return { tokens, costUsd: estimateCostUsd(tokens, provider, model) };
};
