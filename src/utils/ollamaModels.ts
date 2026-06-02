/**
 * Heuristic list of Ollama model families known to support native tool calling.
 * Matching is by family prefix on the model name (before any `:tag` / size
 * suffix). This is a best-effort heuristic — Ollama exposes no reliable
 * capability flag via `/api/tags`, so new tool-capable models may not be listed
 * yet and unlisted models may still work.
 */
export const TOOL_CALLING_FAMILIES = [
  'llama3.1',
  'llama3.2',
  'llama3.3',
  'qwen2.5',
  'qwen3',
  'mistral-nemo',
  'mistral',
  'firefunction',
  'command-r',
  'hermes3',
] as const;

/** Recommended starting points for tool-calling with openMOON. */
export const RECOMMENDED_TOOL_MODELS = ['llama3.1', 'qwen2.5'] as const;

/**
 * Returns true when the model name's family prefix matches a known
 * tool-calling-capable family. Heuristic — see `TOOL_CALLING_FAMILIES`.
 */
export const supportsToolCalling = (model: string): boolean => {
  const name = model.trim().toLowerCase();
  if (!name) return false;
  return TOOL_CALLING_FAMILIES.some((family) => name.startsWith(family));
};
