// Provider-agnostic LLM transport for the two DISPLAY-ONLY surfaces (PRD #11/#39 question
// phrasing, and the architecture-assessment narrative).
//
// This module is transport ONLY. It has no idea what a compliance control is, and it can never
// emit a status, score, gap, or citation — the callers keep those guarantees by returning strictly
// { text } and by falling back to their own deterministic text on any failure. Keeping the HTTP
// shape in one place means the injection posture and the fail-safe behaviour can't drift between
// the two callers.
//
// PROVIDER SELECTION: OpenAI is preferred when an OpenAI key is present (that is the key this
// deployment is configured with), otherwise Anthropic, otherwise nothing (callers pass through to
// their deterministic text). Both runtimes resolve the keys from their own env reader.
//
// MODEL CHOICE: gpt-4.1-mini on OpenAI. Verified against the live API — it accepts the standard
// Chat Completions `max_tokens`, whereas the gpt-5* family rejects it ("Unsupported parameter:
// 'max_tokens' ... use 'max_completion_tokens'"). If you move to a gpt-5* model you MUST switch
// the body field accordingly or every call will fail closed to the deterministic text.

export type LlmProvider = 'openai' | 'anthropic';

export const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
export const OPENAI_MODEL = 'gpt-4.1-mini';

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
export const ANTHROPIC_MODEL = 'claude-sonnet-5';

/** Keys as read from each runtime's env. Either, both, or neither may be present. */
export interface LlmCredentials {
  openaiApiKey?: string | null;
  anthropicApiKey?: string | null;
}

export interface ResolvedLlm {
  provider: LlmProvider;
  apiKey: string;
  model: string;
}

/**
 * Pick a provider from whatever keys exist. OpenAI wins when both are set (this deployment's
 * configured key). Returns null when neither is usable — the caller then passes through to its
 * deterministic text, which is the safe default for every surface in this product.
 */
export function resolveLlm(credentials: LlmCredentials): ResolvedLlm | null {
  const openai = credentials.openaiApiKey?.trim();
  if (openai) return { provider: 'openai', apiKey: openai, model: OPENAI_MODEL };
  const anthropic = credentials.anthropicApiKey?.trim();
  if (anthropic) return { provider: 'anthropic', apiKey: anthropic, model: ANTHROPIC_MODEL };
  return null;
}

/** First text block of an Anthropic Messages response, defensively. */
function extractAnthropicText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: string }).type === 'text') {
      const text = (block as { text?: unknown }).text;
      if (typeof text === 'string') return text;
    }
  }
  return '';
}

/** First choice message content of an OpenAI Chat Completions response, defensively. */
function extractOpenAiText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const message = (choices[0] as { message?: unknown } | undefined)?.message;
  if (!message || typeof message !== 'object') return '';
  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content : '';
}

/**
 * Send one system+user turn and return the model's text. NEVER throws and NEVER returns anything
 * but a string: any missing key, non-2xx, malformed body, or thrown error yields '' so the caller
 * falls back to its own deterministic text. `fetchImpl` is injectable purely for tests.
 */
export async function callLlmText(
  input: { system: string; user: string; maxTokens: number },
  opts: { credentials: LlmCredentials; fetchImpl?: typeof fetch },
): Promise<string> {
  const resolved = resolveLlm(opts.credentials);
  if (!resolved) return '';

  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const response =
      resolved.provider === 'openai'
        ? await doFetch(OPENAI_CHAT_URL, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${resolved.apiKey}`,
            },
            body: JSON.stringify({
              model: resolved.model,
              max_tokens: input.maxTokens,
              messages: [
                { role: 'system', content: input.system },
                { role: 'user', content: input.user },
              ],
            }),
          })
        : await doFetch(ANTHROPIC_MESSAGES_URL, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-api-key': resolved.apiKey,
              'anthropic-version': ANTHROPIC_VERSION,
            },
            body: JSON.stringify({
              model: resolved.model,
              max_tokens: input.maxTokens,
              system: input.system,
              messages: [{ role: 'user', content: input.user }],
            }),
          });

    if (!response.ok) return '';
    const data = await response.json();
    const text = resolved.provider === 'openai' ? extractOpenAiText(data) : extractAnthropicText(data);
    return typeof text === 'string' ? text.trim() : '';
  } catch {
    return ''; // never throw into a query
  }
}
