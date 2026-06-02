/**
 * Client-side token counting and rough cost estimation.
 *
 * The tokenizer (`gpt-tokenizer`) is dynamically imported so its encoding
 * tables stay out of the initial bundle. Until it resolves (or if it fails to
 * load) we fall back to a documented ~4-chars-per-token heuristic.
 */

const HEURISTIC_CHARS_PER_TOKEN = 4;

/** Rough, synchronous estimate: ~4 characters per token. */
export const estimateTokensByChars = (text: string): number =>
  Math.ceil(text.length / HEURISTIC_CHARS_PER_TOKEN);

type Encoder = (text: string) => number;

let encoderPromise: Promise<Encoder> | null = null;

const loadEncoder = (): Promise<Encoder> => {
  if (!encoderPromise) {
    encoderPromise = import('gpt-tokenizer')
      .then((mod): Encoder => (text) => mod.encode(text).length)
      .catch((): Encoder => estimateTokensByChars);
  }
  return encoderPromise;
};

/** Accurate token count via the lazily-loaded tokenizer (cl100k_base). */
export const countTokens = async (text: string): Promise<number> => {
  if (!text) return 0;
  const encode = await loadEncoder();
  return encode(text);
};

/** USD price per 1M input tokens for common OpenAI models (approximate). */
const OPENAI_INPUT_PRICE_PER_MTOK: Record<string, number> = {
  'gpt-4o-mini': 0.15,
  'gpt-4o': 2.5,
  'gpt-4.1': 2.0,
  'gpt-4.1-mini': 0.4,
  'gpt-4.1-nano': 0.1,
  'gpt-4-turbo': 10.0,
  'gpt-3.5-turbo': 0.5,
};

/**
 * Rough input-token cost in USD. Returns `null` when the provider is not
 * OpenAI or the model has no known price (so callers can hide the estimate).
 */
export const estimateCostUsd = (
  tokens: number,
  provider: string,
  model: string,
): number | null => {
  if (provider !== 'openai') return null;
  const pricePerMTok = OPENAI_INPUT_PRICE_PER_MTOK[model];
  if (pricePerMTok === undefined) return null;
  return (tokens / 1_000_000) * pricePerMTok;
};

/** Compact, clearly-approximate cost label. */
export const formatCostUsd = (cost: number): string =>
  cost > 0 && cost < 0.01 ? '<$0.01' : `$${cost.toFixed(2)}`;
