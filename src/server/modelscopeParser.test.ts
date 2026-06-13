import { afterEach, describe, expect, it, vi } from 'vitest';
import { createParserApp } from './app';
import { DEFAULT_MODELSCOPE_FALLBACK_MODELS, DEFAULT_MODELSCOPE_MODEL } from './modelscopeParser';

const MODELSCOPE_URL = 'https://api-inference.modelscope.cn/v1/chat/completions';

function createMockResponse(content: string, usage = { prompt_tokens: 12, completion_tokens: 18, total_tokens: 30 }) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content,
          },
        },
      ],
      usage,
    }),
  } as Response;
}

function readRequestModel(call: unknown[]) {
  const requestInit = call[1] as RequestInit;
  return JSON.parse(String(requestInit.body)).model as string;
}

async function postCommand(app: ReturnType<typeof createParserApp>, text = '画一个登录流程图') {
  return app.request('/api/parse-command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

describe('ModelScope parser API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns a structured error when MODELSCOPE_API_TOKEN is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const app = createParserApp({ apiToken: '' });

    const response = await postCommand(app);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      ok: false,
      source: 'modelscope',
      error: {
        code: 'missing_modelscope_token',
        message: 'MODELSCOPE_API_TOKEN is not configured.',
      },
    });
    expect(body.elapsedMs).toEqual(expect.any(Number));
  });

  it('returns a structured error when the model request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'upstream unavailable',
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const app = createParserApp({ apiToken: 'test-token' });

    const response = await postCommand(app);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledWith(
      MODELSCOPE_URL,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-token',
        }),
      }),
    );
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: 'modelscope_request_failed',
        message: 'ModelScope request failed with status 500.',
      },
    });
  });

  it('keeps DeepSeek V3.2 first and provides multiple ModelScope fallback models', () => {
    expect(DEFAULT_MODELSCOPE_MODEL).toBe('deepseek-ai/DeepSeek-V3.2');
    expect(DEFAULT_MODELSCOPE_FALLBACK_MODELS).toEqual(
      expect.arrayContaining([
        'Qwen/Qwen3-235B-A22B-Instruct-2507',
        'Qwen/Qwen3-30B-A3B-Instruct-2507',
        'Qwen/Qwen3-Next-80B-A3B-Instruct',
        'moonshotai/Kimi-K2.5',
        'ZhipuAI/GLM-5.1',
      ]),
    );
    expect(new Set([DEFAULT_MODELSCOPE_MODEL, ...DEFAULT_MODELSCOPE_FALLBACK_MODELS]).size).toBeGreaterThan(5);
  });

  it('falls back to the next configured model when the preferred model is rate limited', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'rate limited',
      } as Response)
      .mockResolvedValueOnce(
        createMockResponse(
          JSON.stringify({
            scenePlan: {
              template: 'architecture',
              title: '语音绘图架构',
              items: ['语音识别', '解析接口', 'SVG 画布'],
            },
          }),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const app = createParserApp({
      apiToken: 'test-token',
      model: 'primary-limited-model',
      fallbackModels: ['secondary-available-model'],
    });

    const response = await postCommand(app, '把语音绘图整理成架构图');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readRequestModel(fetchMock.mock.calls[0])).toBe('primary-limited-model');
    expect(readRequestModel(fetchMock.mock.calls[1])).toBe('secondary-available-model');
    expect(body).toMatchObject({
      ok: true,
      model: 'secondary-available-model',
      attemptedModels: ['primary-limited-model', 'secondary-available-model'],
      result: {
        scenePlan: {
          template: 'architecture',
          title: '语音绘图架构',
          items: ['语音识别', '解析接口', 'SVG 画布'],
        },
      },
    });
  });

  it('returns a structured error when the model returns invalid JSON text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createMockResponse('not json')));
    const app = createParserApp({ apiToken: 'test-token' });

    const response = await postCommand(app);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: 'invalid_model_json',
        message: 'ModelScope returned non-JSON content.',
      },
    });
  });

  it('returns a structured error when the model JSON does not match the schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        createMockResponse(JSON.stringify({ scenePlan: { template: 'timeline', title: '发布计划', items: ['准备'] } })),
      ),
    );
    const app = createParserApp({ apiToken: 'test-token' });

    const response = await postCommand(app);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: 'invalid_model_output',
        message: 'ModelScope JSON did not match the expected schema.',
      },
    });
  });

  it('parses valid actions from ModelScope output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        createMockResponse(
          JSON.stringify({
            actions: [
              {
                type: 'create',
                objectType: 'rectangle',
                color: '#2563eb',
                position: 'center',
                size: 'medium',
              },
            ],
          }),
        ),
      ),
    );
    const app = createParserApp({ apiToken: 'test-token' });

    const response = await postCommand(app, '画一个蓝色矩形');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      source: 'modelscope',
      model: 'deepseek-ai/DeepSeek-V3.2',
      result: {
        actions: [
          {
            type: 'create',
            objectType: 'rectangle',
            color: '#2563eb',
            position: 'center',
            size: 'medium',
          },
        ],
      },
      usage: { prompt_tokens: 12, completion_tokens: 18, total_tokens: 30 },
    });
  });

  it('parses valid scenePlan output for complex natural language', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        createMockResponse(
          JSON.stringify({
            scenePlan: {
              template: 'flowchart',
              title: '登录流程',
              items: ['打开页面', '输入账号', '完成登录'],
            },
          }),
        ),
      ),
    );
    const app = createParserApp({ apiToken: 'test-token', model: 'custom-model' });

    const response = await postCommand(app, '帮我整理一张登录流程图');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      model: 'custom-model',
      result: {
        scenePlan: {
          template: 'flowchart',
          title: '登录流程',
          items: ['打开页面', '输入账号', '完成登录'],
        },
      },
    });
  });

  it('parses safe fine-tuning update actions from ModelScope output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        createMockResponse(
          JSON.stringify({
            actions: [
              {
                type: 'update',
                target: { objectType: 'arrow', strategy: 'latest' },
                changes: { translate: { dx: 24, dy: 0 } },
              },
            ],
          }),
        ),
      ),
    );
    const app = createParserApp({ apiToken: 'test-token' });

    const response = await postCommand(app, '把箭头右移一点');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      result: {
        actions: [
          {
            type: 'update',
            target: { objectType: 'arrow', strategy: 'latest' },
            changes: { translate: { dx: 24, dy: 0 } },
          },
        ],
      },
    });
  });
});
