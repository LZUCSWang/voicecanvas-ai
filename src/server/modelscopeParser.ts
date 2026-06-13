import { z } from 'zod';
import {
  modelParserOutputSchema,
  tokenUsageSchema,
  type ModelParserOutput,
  type TokenUsage,
} from './modelscopeSchemas';

export const MODELSCOPE_CHAT_COMPLETIONS_URL = 'https://api-inference.modelscope.cn/v1/chat/completions';
export const DEFAULT_MODELSCOPE_MODEL = 'deepseek-ai/DeepSeek-V3.2';
export const DEFAULT_MODELSCOPE_FALLBACK_MODELS = [
  'deepseek-ai/DeepSeek-V4-Flash',
  'Qwen/Qwen3-235B-A22B-Instruct-2507',
  'Qwen/Qwen3-30B-A3B-Instruct-2507',
  'Qwen/Qwen3-Next-80B-A3B-Instruct',
  'moonshotai/Kimi-K2.5',
  'ZhipuAI/GLM-5.1',
  'MiniMax/MiniMax-M3',
] as const;

export const MODELSCOPE_SYSTEM_PROMPT = [
  'You are the server-side command parser for VoiceCanvas AI.',
  'Return only valid JSON. Do not return Markdown, code fences, comments, or explanatory text.',
  'The response must match exactly one of these shapes:',
  '{"actions":[DrawAction,...]}',
  '{"scenePlan":{"template":"flowchart|mind-map|comparison|architecture|poster","title":"...","items":["..."]}}',
  'For complex natural language, high-level diagrams, posters, comparisons, architecture diagrams, or vague layout requests, prefer scenePlan instead of inventing uncontrolled coordinates.',
  'Use actions only for safe direct edits such as creating simple objects, clearing the canvas, deleting a selected object, or fine-tuning an existing object.',
  'DrawAction supports create, update, delete, and clear.',
  'create fields: objectType circle|rectangle|triangle|line|arrow|text, color, position, size, text, style, customBounds, customLine.',
  'update fields: targetId or target selector, plus changes.',
  'target selector fields: id, objectType, color, position, textIncludes, strategy latest|first|last.',
  'changes fields: color, position, size, text, translate {dx,dy}, scale, resize {dw,dh}, strokeWidthDelta, strokeStyle solid|dashed, fillOpacityDelta, layer front|back|forward|backward.',
  'delete supports targetId or target selector. If the user says "the arrow" or "recent rectangle", use target with strategy "latest".',
  'For small relative edits like "move the arrow right a little", return a safe update action such as translate {dx:24,dy:0}.',
].join('\n');

export interface ParserConfig {
  apiToken: string;
  model: string;
  fallbackModels: string[];
  fetchFn: typeof fetch;
  logger: Pick<Console, 'info'>;
  now: () => number;
}

export type ParserHttpStatus = 200 | 400 | 422 | 502 | 503;

export type ParserSuccessBody = {
  ok: true;
  source: 'modelscope';
  model: string;
  attemptedModels: string[];
  result: ModelParserOutput;
  usage: TokenUsage | null;
  elapsedMs: number;
};

export type ParserErrorBody = {
  ok: false;
  source: 'modelscope';
  model: string;
  attemptedModels: string[];
  error: {
    code:
      | 'missing_modelscope_token'
      | 'invalid_request'
      | 'modelscope_request_failed'
      | 'invalid_modelscope_response'
      | 'invalid_model_json'
      | 'invalid_model_output';
    message: string;
    details?: unknown;
  };
  usage: TokenUsage | null;
  elapsedMs: number;
};

export type ParserResponse =
  | {
      status: 200;
      body: ParserSuccessBody;
    }
  | {
      status: Exclude<ParserHttpStatus, 200>;
      body: ParserErrorBody;
    };

const modelscopeChatResponseSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: z
              .object({
                content: z.string(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),
    usage: tokenUsageSchema.optional(),
  })
  .passthrough();

interface ModelAttemptFailure {
  model: string;
  code: ParserErrorBody['error']['code'];
  message: string;
  usage: TokenUsage | null;
  details?: unknown;
}

export function createParserConfig(overrides: Partial<ParserConfig> = {}): ParserConfig {
  const envFallbackModels = parseModelList(process.env.MODELSCOPE_FALLBACK_MODELS);

  return {
    apiToken: overrides.apiToken ?? process.env.MODELSCOPE_API_TOKEN ?? '',
    model: overrides.model ?? process.env.MODELSCOPE_MODEL ?? DEFAULT_MODELSCOPE_MODEL,
    fallbackModels:
      overrides.fallbackModels ??
      (envFallbackModels.length > 0 ? envFallbackModels : [...DEFAULT_MODELSCOPE_FALLBACK_MODELS]),
    fetchFn: overrides.fetchFn ?? fetch,
    logger: overrides.logger ?? console,
    now: overrides.now ?? Date.now,
  };
}

export async function parseModelScopeCommand(text: string, config: ParserConfig): Promise<ParserResponse> {
  const startedAt = config.now();
  const modelCandidates = createModelCandidates(config);
  const defaultModel = modelCandidates[0] ?? DEFAULT_MODELSCOPE_MODEL;

  if (!config.apiToken) {
    return errorResponse(
      config,
      startedAt,
      defaultModel,
      503,
      'missing_modelscope_token',
      'MODELSCOPE_API_TOKEN is not configured.',
    );
  }

  const failures: ModelAttemptFailure[] = [];
  const attemptedModels: string[] = [];

  for (const model of modelCandidates) {
    attemptedModels.push(model);
    const attempt = await parseModelScopeCommandWithModel(text, model, config);

    if (attempt.ok) {
      const body: ParserSuccessBody = {
        ok: true,
        source: 'modelscope',
        model,
        attemptedModels,
        result: attempt.result,
        usage: attempt.usage,
        elapsedMs: elapsed(config, startedAt),
      };
      logParse(config, body.elapsedMs, true, model, attempt.usage, undefined, attemptedModels);

      return {
        status: 200,
        body,
      };
    }

    failures.push(attempt);
  }

  const lastFailure = failures.at(-1);

  return errorResponse(
    config,
    startedAt,
    lastFailure?.model ?? defaultModel,
    lastFailure && (lastFailure.code === 'invalid_model_json' || lastFailure.code === 'invalid_model_output') ? 422 : 502,
    lastFailure?.code ?? 'modelscope_request_failed',
    lastFailure?.message ?? 'All ModelScope model attempts failed.',
    { attempts: failures },
    lastFailure?.usage ?? null,
    attemptedModels,
  );
}

async function parseModelScopeCommandWithModel(
  text: string,
  model: string,
  config: ParserConfig,
): Promise<
  | {
      ok: true;
      result: ModelParserOutput;
      usage: TokenUsage | null;
    }
  | (ModelAttemptFailure & { ok: false })
> {
  let upstreamResponse: Response;

  try {
    upstreamResponse = await config.fetchFn(MODELSCOPE_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: MODELSCOPE_SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });
  } catch {
    return {
      ok: false,
      model,
      code: 'modelscope_request_failed',
      message: 'ModelScope request failed before a response was received.',
      usage: null,
    };
  }

  if (!upstreamResponse.ok) {
    return {
      ok: false,
      model,
      code: 'modelscope_request_failed',
      message: `ModelScope request failed with status ${upstreamResponse.status}.`,
      usage: null,
      details: { status: upstreamResponse.status },
    };
  }

  let responseJson: unknown;

  try {
    responseJson = await upstreamResponse.json();
  } catch {
    return {
      ok: false,
      model,
      code: 'invalid_modelscope_response',
      message: 'ModelScope returned an unreadable JSON response.',
      usage: null,
    };
  }

  const chatResponse = modelscopeChatResponseSchema.safeParse(responseJson);

  if (!chatResponse.success) {
    return {
      ok: false,
      model,
      code: 'invalid_modelscope_response',
      message: 'ModelScope response did not include a chat message.',
      details: chatResponse.error.flatten(),
      usage: null,
    };
  }

  const usage = chatResponse.data.usage ?? null;
  const content = chatResponse.data.choices[0].message.content.trim();
  let parsedContent: unknown;

  try {
    parsedContent = JSON.parse(content);
  } catch {
    return {
      ok: false,
      model,
      code: 'invalid_model_json',
      message: 'ModelScope returned non-JSON content.',
      usage,
    };
  }

  const modelOutput = modelParserOutputSchema.safeParse(parsedContent);

  if (!modelOutput.success) {
    return {
      ok: false,
      model,
      code: 'invalid_model_output',
      message: 'ModelScope JSON did not match the expected schema.',
      details: modelOutput.error.flatten(),
      usage,
    };
  }

  return {
    ok: true,
    result: modelOutput.data as ModelParserOutput,
    usage,
  };
}

export function errorResponse(
  config: ParserConfig,
  startedAt: number,
  model: string,
  status: Exclude<ParserHttpStatus, 200>,
  code: ParserErrorBody['error']['code'],
  message: string,
  details?: unknown,
  usage: TokenUsage | null = null,
  attemptedModels: string[] = [],
): ParserResponse {
  const body: ParserErrorBody = {
    ok: false,
    source: 'modelscope',
    model,
    attemptedModels,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
    usage,
    elapsedMs: elapsed(config, startedAt),
  };
  logParse(config, body.elapsedMs, false, model, usage, code, attemptedModels);

  return {
    status,
    body,
  };
}

function elapsed(config: ParserConfig, startedAt: number): number {
  return Math.max(0, Math.round(config.now() - startedAt));
}

function parseModelList(input: string | undefined): string[] {
  if (!input) {
    return [];
  }

  return input
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
}

function createModelCandidates(config: ParserConfig): string[] {
  return [...new Set([config.model || DEFAULT_MODELSCOPE_MODEL, ...config.fallbackModels])];
}

function logParse(
  config: ParserConfig,
  elapsedMs: number,
  success: boolean,
  model: string,
  usage: TokenUsage | null,
  errorCode?: ParserErrorBody['error']['code'],
  attemptedModels: string[] = [],
) {
  config.logger.info('[modelscope-parser]', {
    elapsedMs,
    success,
    model,
    attemptedModels,
    usage,
    ...(errorCode ? { errorCode } : {}),
  });
}
