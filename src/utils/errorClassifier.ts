export type ErrorCategory = 'provider' | 'budget' | 'tool' | 'unknown';

export interface ClassifiedError {
  category: ErrorCategory;
  message: string;
  raw: string;
}

export function classifyError(raw: unknown): ClassifiedError {
  const s = String(raw ?? '');
  const lower = s.toLowerCase();

  if (
    lower.includes('no openai api key') ||
    lower.includes('api key') ||
    lower.includes('401') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid api key')
  ) {
    return {
      category: 'provider',
      message: "Couldn't reach the AI provider. Check your API key in Settings.",
      raw: s,
    };
  }

  if (
    lower.includes('openai api error') ||
    lower.includes('ollama error') ||
    lower.includes('no response from') ||
    lower.includes('connection refused') ||
    lower.includes("doesn't support tool calling") ||
    lower.includes('does not support tool')
  ) {
    return {
      category: 'provider',
      message: "Couldn't reach the AI provider. Check your connection and settings.",
      raw: s,
    };
  }

  if (lower.includes('budget')) {
    return { category: 'budget', message: s, raw: s };
  }

  if (lower.includes('tool') && (lower.includes('error') || lower.includes('failed'))) {
    const short = s.length > 140 ? `${s.slice(0, 140)}\u2026` : s;
    return { category: 'tool', message: `A tool failed: ${short}`, raw: s };
  }

  return {
    category: 'unknown',
    message: 'Something went wrong. You can retry your last request.',
    raw: s,
  };
}

export function isBudgetResponse(text: string): boolean {
  return text.includes('Reached the cost budget') || text.includes('Reached the step budget');
}
