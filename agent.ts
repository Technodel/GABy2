/**
 * GABy Agent â€” Multi-provider AI caller with Prompt Caching support.
 *
 * Supported providers:
 *   Anthropic      â†’ @anthropic-ai/sdk (with cache_control breakpoints)
 *   DeepSeek       â†’ OpenAI-compatible API at api.deepseek.com
 *   Groq           â†’ OpenAI-compatible API at api.groq.com
 *   OpenRouter     â†’ OpenAI-compatible API at openrouter.ai
 *   OpenAI         â†’ OpenAI-compatible API at api.openai.com
 *
 * Per-mode fallback: keys are sorted by `priority` (1=primary, 2=fallback â€¦).
 * If the primary key/provider fails, the next priority key is tried automatically.
 *
 * Cache pricing (Anthropic only):
 *   Cache write: 1.25x base input rate
 *   Cache read:  0.10x base input rate
 */

import Anthropic from '@anthropic-ai/sdk';
import { getDb } from './db';

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentRequest {
  mode: string;
  systemPrompt: string;
  projectContext?: string;
  fileContext?: string;
  history: AgentMessage[];
  userMessage: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface AgentTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}

export interface AgentResponse {
  content: string;
  usage: AgentTokenUsage;
}

// â”€â”€ Provider routing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const OPENAI_COMPAT_BASE_URLS: Record<string, string> = {
  'DeepSeek':   'https://api.deepseek.com/v1',
  'Groq':       'https://api.groq.com/openai/v1',
  'OpenRouter': 'https://openrouter.ai/api/v1',
  'OpenAI':     'https://api.openai.com/v1',
  'Gemini':     'https://generativelanguage.googleapis.com/v1beta/openai',
};

interface KeyEntry {
  key_value: string;
  provider: string;
  model_id_override: string | null;
  priority: number;
}

// â”€â”€ DB helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function isCachingEnabled(): boolean {
  const row = getDb()
    .prepare("SELECT value FROM app_settings WHERE key = 'prompt_caching_enabled'")
    .get() as { value: string } | undefined;
  return row?.value === 'true';
}

function getKeysForMode(mode: string): KeyEntry[] {
  return getDb()
    .prepare('SELECT key_value, provider, model_id_override, priority FROM api_keys WHERE mode = ? AND is_active = 1 ORDER BY priority ASC')
    .all(mode) as KeyEntry[];
}

function getModelForMode(mode: string): string {
  const row = getDb()
    .prepare('SELECT model_id FROM pricing_modes WHERE mode = ?')
    .get(mode) as { model_id: string } | undefined;
  return row?.model_id || 'deepseek-chat';
}

// â”€â”€ Anthropic call (with prompt caching) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function callAnthropic(apiKey: string, model: string, req: AgentRequest): Promise<AgentResponse> {
  const useCache = isCachingEnabled();
  const client = new Anthropic({ apiKey });

  const systemContent: Anthropic.Messages.TextBlockParam[] = [
    {
      type: 'text',
      text: req.systemPrompt,
      ...(useCache ? { cache_control: { type: 'ephemeral' } } : {}),
    },
  ];

  const userBlocks: Anthropic.Messages.TextBlockParam[] = [];
  if (req.projectContext?.trim()) {
    userBlocks.push({ type: 'text', text: req.projectContext, ...(useCache ? { cache_control: { type: 'ephemeral' } } : {}) });
  }
  if (req.fileContext?.trim()) {
    userBlocks.push({ type: 'text', text: req.fileContext, ...(useCache ? { cache_control: { type: 'ephemeral' } } : {}) });
  }
  userBlocks.push({ type: 'text', text: req.userMessage });

  const messages: Anthropic.Messages.MessageParam[] = [
    ...req.history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: userBlocks },
  ];

  const anthropicSignal = req.signal || undefined;

  const response = await client.messages.create({
    model,
    max_tokens: req.maxTokens ?? 4096,
    system: systemContent,
    messages,
    ...(anthropicSignal ? { signal: anthropicSignal } : {}),
  });

  const outputText = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  const usage = response.usage as Anthropic.Messages.Usage & {
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };

  return {
    content: outputText,
    usage: {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    },
  };
}

// â”€â”€ OpenAI-compatible call (DeepSeek, Groq, OpenRouter, etc.) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function callOpenAICompat(baseUrl: string, apiKey: string, model: string, provider: string, req: AgentRequest): Promise<AgentResponse> {
  const systemText = [req.systemPrompt, req.projectContext, req.fileContext]
    .filter(Boolean)
    .join('\n\n---\n\n');

  const messages = [
    { role: 'system', content: systemText },
    ...req.history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: req.userMessage },
  ];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
  if (provider === 'OpenRouter') {
    headers['HTTP-Referer'] = 'https://gaby.app';
    headers['X-Title'] = 'GABy';
  }

  const abortController = new AbortController();
  const timeoutTimer = setTimeout(() => abortController.abort(new Error('Request timed out')), 120_000);
  if (req.signal) {
    req.signal.addEventListener('abort', () => {
      clearTimeout(timeoutTimer);
      abortController.abort(req.signal?.reason);
    }, { once: true });
  }

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, max_tokens: req.maxTokens ?? 4096, messages }),
    signal: abortController.signal,
  });
  clearTimeout(timeoutTimer);

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`${provider} API ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data = await resp.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  };

  return {
    content: data.choices?.[0]?.message?.content ?? '',
    usage: {
      inputTokens:     data.usage?.prompt_tokens ?? 0,
      outputTokens:    data.usage?.completion_tokens ?? 0,
      cacheWriteTokens: 0,
      cacheReadTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    },
  };
}

// â”€â”€ Streaming â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type StreamCallback = (chunk: string) => void;

async function callOpenAICompatStream(
  baseUrl: string, apiKey: string, model: string, provider: string,
  req: AgentRequest, onChunk: StreamCallback
): Promise<AgentResponse> {
  const systemText = [req.systemPrompt, req.projectContext, req.fileContext]
    .filter(Boolean)
    .join('\n\n---\n\n');

  const messages = [
    { role: 'system', content: systemText },
    ...req.history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: req.userMessage },
  ];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
  if (provider === 'OpenRouter') {
    headers['HTTP-Referer'] = 'https://gaby.app';
    headers['X-Title'] = 'GABy';
  }

  const abortController = new AbortController();
  const timeoutTimer = setTimeout(() => abortController.abort(new Error('Request timed out')), 120_000);
  if (req.signal) {
    req.signal.addEventListener('abort', () => {
      clearTimeout(timeoutTimer);
      abortController.abort(req.signal?.reason);
    }, { once: true });
  }

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, max_tokens: req.maxTokens ?? 4096, messages, stream: true }),
    signal: abortController.signal,
  });
  clearTimeout(timeoutTimer);

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`${provider} API ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error(`${provider}: No response body`);

  const decoder = new TextDecoder();
  let fullContent = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') break;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          onChunk(delta);
        }
        // Track usage from the final chunk (if provided mid-stream)
        if (parsed.usage) {
          inputTokens = parsed.usage.prompt_tokens || 0;
          outputTokens = parsed.usage.completion_tokens || 0;
          cachedTokens = parsed.usage.prompt_tokens_details?.cached_tokens || 0;
        }
        // x-usage headers sometimes come in the last chunk
        if (parsed.x_usage) {
          inputTokens = parsed.x_usage.prompt_tokens || 0;
          outputTokens = parsed.x_usage.completion_tokens || 0;
        }
      } catch { /* skip malformed JSON lines */ }
    }
  }

  return {
    content: fullContent,
    usage: {
      inputTokens,
      outputTokens,
      cacheWriteTokens: 0,
      cacheReadTokens: cachedTokens,
    },
  };
}

// â”€â”€ Main entry point (non-streaming) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function callAgent(req: AgentRequest): Promise<AgentResponse> {
  const keys = getKeysForMode(req.mode);
  if (keys.length === 0) throw new Error(`No active API key configured for mode "${req.mode}"`);

  const modeModel = getModelForMode(req.mode);
  let lastError: Error = new Error('No keys attempted');

  for (const key of keys) {
    const model = key.model_id_override ?? modeModel;
    try {
      if (key.provider === 'Anthropic') {
        return await callAnthropic(key.key_value, model, req);
      }
      const baseUrl = OPENAI_COMPAT_BASE_URLS[key.provider] ?? 'https://api.openai.com/v1';
      return await callOpenAICompat(baseUrl, key.key_value, model, key.provider, req);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isLast = keys.indexOf(key) === keys.length - 1;
      if (!isLast) {
        console.warn(`[agent] ${key.provider} failed (priority ${key.priority}), trying next fallback: ${lastError.message}`);
      }
    }
  }

  throw lastError;
}

// â”€â”€ Main entry point (streaming) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function callAgentStream(
  req: AgentRequest,
  onChunk: StreamCallback
): Promise<AgentResponse> {
  const keys = getKeysForMode(req.mode);
  if (keys.length === 0) throw new Error(`No active API key configured for mode "${req.mode}"`);

  const modeModel = getModelForMode(req.mode);
  let lastError: Error = new Error('No keys attempted');

  for (const key of keys) {
    const model = key.model_id_override ?? modeModel;
    try {
      if (key.provider === 'Anthropic') {
        // Anthropic streaming not implemented yet — fall back to non-streaming
        return await callAnthropic(key.key_value, model, req);
      }
      const baseUrl = OPENAI_COMPAT_BASE_URLS[key.provider] ?? 'https://api.openai.com/v1';
      return await callOpenAICompatStream(baseUrl, key.key_value, model, key.provider, req, onChunk);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isLast = keys.indexOf(key) === keys.length - 1;
      if (!isLast) {
        console.warn(`[agent] ${key.provider} streaming failed, trying next fallback: ${lastError.message}`);
      }
    }
  }

  throw lastError;
}

