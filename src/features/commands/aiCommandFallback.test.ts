import { describe, expect, it, vi } from 'vitest';
import { executeDrawingAction } from '../../domain/drawingExecutor';
import { createInitialDrawingState } from '../../domain/drawingState';
import type { DrawAction, DrawingHistoryAction, DrawingState } from '../../domain/drawingTypes';
import {
  AI_UNAVAILABLE_FALLBACK_MESSAGE,
  DEFAULT_AI_COMMAND_TIMEOUT_MS,
  buildAiCommandPayload,
  createAiCommandResolver,
  createCanvasContext,
  createCommandCacheKey,
  shouldUseAiParser,
} from './aiCommandFallback';
import { parseLocalCommand } from './localCommandParser';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function getCreatedTextValues(actions: DrawAction[]) {
  return actions.flatMap((action) => {
    if (action.type === 'create' && action.objectType === 'text' && action.text) {
      return [action.text];
    }

    return [];
  });
}

function getDrawActions(actions: DrawingHistoryAction[]): DrawAction[] {
  return actions.filter((action): action is DrawAction =>
    action.type === 'create' || action.type === 'update' || action.type === 'delete' || action.type === 'clear',
  );
}

function createState(actions: DrawAction[]): DrawingState {
  return actions.reduce(executeDrawingAction, createInitialDrawingState());
}

function readRequestBody(fetchFn: ReturnType<typeof vi.fn>, callIndex = 0) {
  return JSON.parse(String(fetchFn.mock.calls[callIndex][1].body)) as Record<string, unknown>;
}

describe('AI command fallback', () => {
  it('uses AI by default for simple commands that local parsing could handle', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        result: {
          actions: [
            { type: 'create', objectType: 'circle', color: '#ef4444', position: 'center', size: 'medium' },
          ],
        },
      }),
    );
    const resolve = createAiCommandResolver({ fetchFn });

    const result = await resolve('画一个红色圆形');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(readRequestBody(fetchFn)).toMatchObject({
      text: '画一个红色圆形',
      conversation: [],
      recentActions: [],
    });
    expect(result).toMatchObject({
      ok: true,
      source: 'ai',
      fromCache: false,
      sceneType: null,
      actionSummary: '创建 circle',
    });
    expect(result.actions).toEqual([
      { type: 'create', objectType: 'circle', color: '#ef4444', position: 'center', size: 'medium' },
    ]);
  });

  it('sends conversation, canvas, and recent action context with every AI request', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
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
      }),
    );
    const drawingState = createState([
      { type: 'create', objectType: 'rectangle', color: '#2563eb', position: 'left', size: 'medium' },
      { type: 'create', objectType: 'arrow', color: '#7c3aed', position: 'right', size: 'medium' },
      { type: 'create', objectType: 'text', color: '#111827', position: 'bottom-right', size: 'small', text: '草稿' },
    ]);
    const resolve = createAiCommandResolver({ fetchFn });

    await resolve('把箭头右移一点', {
      drawingState,
      conversation: [
        {
          text: '画一个登录流程图',
          source: 'ai',
          feedback: '已生成流程图',
          error: '',
        },
      ],
      recentActions: [
        { type: 'create', objectType: 'arrow', color: '#7c3aed', position: 'right', size: 'medium' },
      ],
      canvasRevision: 3,
      conversationRevision: 1,
    });

    const body = readRequestBody(fetchFn);

    expect(body).toMatchObject({
      text: '把箭头右移一点',
      conversation: [
        {
          text: '画一个登录流程图',
          source: 'ai',
          feedback: '已生成流程图',
        },
      ],
      recentActions: [
        { type: 'create', objectType: 'arrow', color: '#7c3aed', position: 'right', size: 'medium' },
      ],
    });
    expect(body.canvas).toMatchObject({
      objectCount: 3,
      objects: [
        expect.objectContaining({
          id: 'drawing-object-1',
          type: 'rectangle',
          color: '#2563eb',
          position: 'left',
          bounds: expect.objectContaining({ width: 140, height: 100 }),
          order: 0,
          zIndex: 0,
        }),
        expect.objectContaining({
          id: 'drawing-object-2',
          type: 'arrow',
          color: '#7c3aed',
          position: 'right',
          geometry: expect.objectContaining({ kind: 'arrow' }),
          order: 1,
          zIndex: 1,
        }),
        expect.objectContaining({
          id: 'drawing-object-3',
          type: 'text',
          text: '草稿',
          order: 2,
          zIndex: 2,
        }),
      ],
    });
    expect(body.canvas).not.toHaveProperty('geometry');
  });

  it('builds a bounded safe context payload from drawing state and command history', () => {
    const drawingState = createState([
      { type: 'create', objectType: 'rectangle', color: '#2563eb', position: 'left', size: 'medium' },
      { type: 'create', objectType: 'text', color: '#111827', position: 'center', size: 'small', text: '用户手机号：13800000000' },
    ]);
    const payload = buildAiCommandPayload({
      text: '把草稿文字删掉',
      normalizedText: '把草稿文字删掉',
      drawingState,
      conversation: Array.from({ length: 12 }, (_, index) => ({
        text: `命令 ${index}`,
        source: index % 2 === 0 ? 'ai' : 'local-fallback',
        feedback: `反馈 ${index}`,
        error: index === 11 ? '最后一个错误摘要' : undefined,
      })),
      recentActions: Array.from({ length: 22 }, (_, index) => ({
        type: 'create',
        objectType: 'text',
        text: `动作 ${index}`,
      })),
    });

    expect(payload.text).toBe('把草稿文字删掉');
    expect(payload.conversation).toHaveLength(8);
    expect(payload.conversation[0]).toMatchObject({ text: '命令 4' });
    expect(payload.conversation.at(-1)).toMatchObject({ text: '命令 11', error: '最后一个错误摘要' });
    expect(payload.recentActions).toHaveLength(16);
    expect(payload.recentActions[0]).toMatchObject({ text: '动作 6' });
    expect(payload.canvas.objects).toEqual([
      expect.objectContaining({
        id: 'drawing-object-1',
        type: 'rectangle',
        text: undefined,
        style: expect.any(Object),
        order: 0,
        zIndex: 0,
      }),
      expect.objectContaining({
        id: 'drawing-object-2',
        type: 'text',
        text: '用户手机号：13800000000',
        order: 1,
        zIndex: 1,
      }),
    ]);
  });

  it('uses AI for complex scene descriptions even when local parsing can match a generic scene', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        source: 'modelscope',
        result: {
          scenePlan: {
            template: 'architecture',
            title: '数据流架构图',
            items: ['语音识别', '本地解析', '云端模型', 'SVG 画布'],
          },
        },
        elapsedMs: 188,
      }),
    );
    const now = vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1264);
    const resolve = createAiCommandResolver({ fetchFn, now });

    const result = await resolve('把语音识别、本地解析、云端模型和 SVG 画布整理成一张数据流架构图');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(
      '/api/parse-command',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      source: 'ai',
      fromCache: false,
      elapsedMs: 264,
      sceneType: 'architecture',
      actionSummary: '生成 architecture 场景',
    });
    expect(result.actions[0]).toEqual({ type: 'clear' });
    expect(getCreatedTextValues(getDrawActions(result.actions))).toEqual(expect.arrayContaining(['数据流架构图', '云端模型']));
    expect(result.statusText).toContain('AI解析(ai)');
    expect(result.statusText).toContain('耗时 264ms');
    expect(result.statusText).toContain('已携带 canvas/conversation/recentActions 上下文');
  });

  it('accepts safe AI fine-tuning actions compatible with target selectors and PR7 changes', async () => {
    const aiActions = [
      {
        type: 'update',
        target: { objectType: 'arrow', strategy: 'latest' },
        changes: { translate: { dx: 24, dy: 0 } },
      },
      {
        type: 'update',
        target: { objectType: 'rectangle', color: '#2563eb', strategy: 'latest' },
        changes: {
          scale: 1.15,
          resize: { dw: 24, dh: 0 },
          strokeWidthDelta: 2,
          strokeStyle: 'dashed',
          fillOpacityDelta: -0.1,
          layer: 'front',
        },
      },
      {
        type: 'delete',
        target: { objectType: 'text', textIncludes: '草稿', strategy: 'latest' },
      },
    ] satisfies DrawAction[];
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: { actions: aiActions } }));
    const resolve = createAiCommandResolver({ fetchFn });

    const result = await resolve('请把当前画面里的箭头、蓝色矩形和草稿文字做细节整理');

    expect(result).toMatchObject({
      ok: true,
      source: 'ai',
      sceneType: null,
      actionSummary: '微调动作 3 个',
    });
    expect(result.actions).toEqual(aiActions);
    expect(result.statusText).toContain('微调动作 3 个');
  });

  it('accepts AI-controlled freeform geometry and absolute style details', async () => {
    const aiActions = [
      {
        type: 'create',
        objectType: 'circle',
        color: '#2563eb',
        customGeometry: { kind: 'circle', cx: 180, cy: 150, radius: 42 },
        style: { strokeWidth: 5, fillOpacity: 0.22 },
      },
      {
        type: 'create',
        objectType: 'rectangle',
        color: '#7c3aed',
        customGeometry: { kind: 'rectangle', x: 260, y: 96, width: 188, height: 72, rx: 18, ry: 12 },
        style: { cornerRadius: 18 },
      },
      {
        type: 'create',
        objectType: 'arrow',
        color: '#e11d48',
        customGeometry: {
          kind: 'curve',
          start: { x: 120, y: 260 },
          control1: { x: 220, y: 190 },
          control2: { x: 360, y: 330 },
          end: { x: 480, y: 260 },
        },
        style: { arrowHeadSize: 16, lineCap: 'round', lineJoin: 'round' },
      },
      {
        type: 'update',
        target: { objectType: 'arrow', strategy: 'latest' },
        changes: {
          geometry: {
            kind: 'polyline',
            points: [
              { x: 130, y: 270 },
              { x: 250, y: 210 },
              { x: 390, y: 315 },
              { x: 510, y: 270 },
            ],
          },
          style: { strokeWidth: 6, arrowHeadSize: 18 },
        },
      },
    ] satisfies DrawAction[];
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: { actions: aiActions } }));
    const resolve = createAiCommandResolver({ fetchFn });

    const result = await resolve('请自由决定圆大小、圆角矩形弧度和弯曲箭头路径，做一个细腻的结构图');

    expect(result).toMatchObject({
      ok: true,
      source: 'ai',
    });
    expect(result.actions).toEqual(aiActions);
  });

  it('rejects unsafe AI actions before execution', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        result: {
          actions: [{ type: 'update', target: { objectType: 'arrow' }, changes: { scale: -2 } }],
        },
      }),
    );
    const resolve = createAiCommandResolver({ fetchFn });

    const result = await resolve('帮我把箭头处理成更醒目的样子');

    expect(result).toMatchObject({
      ok: false,
      source: 'local-fallback',
      actions: [],
    });
    expect(result.error).toContain('AI 返回内容未通过前端安全校验');
    expect(result.statusText).toContain(AI_UNAVAILABLE_FALLBACK_MESSAGE);
  });

  it('rejects unrelated connector edits for text-specific micro-adjustment commands', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        result: {
          actions: [
            {
              type: 'update',
              target: { objectType: 'arrow', color: '#e11d48', strategy: 'latest' },
              changes: { strokeWidthDelta: 4 },
            },
          ],
        },
      }),
    );
    const drawingState = createState([
      {
        type: 'create',
        objectType: 'text',
        color: '#111827',
        position: 'center',
        size: 'small',
        text: 'Multi-Head Self-Attention',
      },
      {
        type: 'create',
        objectType: 'arrow',
        color: '#e11d48',
        position: 'right',
        size: 'medium',
      },
    ]);
    const resolve = createAiCommandResolver({ fetchFn });

    const result = await resolve('把当前画面中包含“Multi-Head Self-Attention”的文字放大一点，并把对应矩形置顶。', {
      drawingState,
    });

    expect(result).toMatchObject({
      ok: false,
      source: 'local-fallback',
      actions: [],
    });
    expect(result.error).toContain('AI 返回微调动作与文字目标不匹配');
    expect(result.statusText).toContain(AI_UNAVAILABLE_FALLBACK_MESSAGE);
  });

  it('keeps matched text above its corresponding rectangle when text-specific commands bring the rectangle to front', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        result: {
          actions: [
            {
              type: 'update',
              target: { objectType: 'text', textIncludes: 'Multi-Head Self-Attention', strategy: 'latest' },
              changes: { scale: 1.15 },
            },
            {
              type: 'update',
              target: { objectType: 'rectangle', color: '#7c3aed', strategy: 'latest' },
              changes: { layer: 'front' },
            },
          ],
        },
      }),
    );
    const drawingState = createState([
      {
        type: 'create',
        objectType: 'rectangle',
        color: '#7c3aed',
        position: 'center',
        size: 'medium',
      },
      {
        type: 'create',
        objectType: 'text',
        color: '#111827',
        position: 'center',
        size: 'small',
        text: 'Multi-Head Self-Attention',
      },
    ]);
    const resolve = createAiCommandResolver({ fetchFn });

    const result = await resolve('把当前画面中包含“Multi-Head Self-Attention”的文字放大一点，并把对应矩形置顶。', {
      drawingState,
    });

    expect(result).toMatchObject({
      ok: true,
      source: 'ai',
    });
    expect(result.actions).toEqual([
      {
        type: 'update',
        target: { objectType: 'text', textIncludes: 'Multi-Head Self-Attention', strategy: 'latest' },
        changes: { scale: 1.15 },
      },
      {
        type: 'update',
        target: { objectType: 'rectangle', color: '#7c3aed', strategy: 'latest' },
        changes: { layer: 'front' },
      },
      {
        type: 'update',
        target: { objectType: 'text', textIncludes: 'Multi-Head Self-Attention', strategy: 'latest' },
        changes: { layer: 'front' },
      },
    ]);
  });

  it('caches identical AI texts only for the same canvas and conversation revision', async () => {
    const fetchFn = vi.fn().mockImplementation(() =>
      jsonResponse({
        ok: true,
        result: {
          scenePlan: {
            template: 'flowchart',
            title: '缓存流程',
            items: ['第一次解析', '复用结果', '生成画面'],
          },
        },
      }),
    );
    const resolve = createAiCommandResolver({ fetchFn });
    const text = '帮我整理一个包含缓存命中的流程图';

    const firstResult = await resolve(text, { canvasRevision: 1, conversationRevision: 1 });
    const secondResult = await resolve(text, { canvasRevision: 1, conversationRevision: 1 });
    const thirdResult = await resolve(text, { canvasRevision: 2, conversationRevision: 1 });
    const fourthResult = await resolve(text, { canvasRevision: 2, conversationRevision: 2 });

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(firstResult).toMatchObject({ ok: true, source: 'ai', fromCache: false });
    expect(secondResult).toMatchObject({ ok: true, source: 'ai', fromCache: true, elapsedMs: 0 });
    expect(thirdResult).toMatchObject({ ok: true, source: 'ai', fromCache: false });
    expect(fourthResult).toMatchObject({ ok: true, source: 'ai', fromCache: false });
    expect(secondResult.actions).toEqual(firstResult.actions);
    expect(secondResult.statusText).toContain('缓存命中');
  });

  it('uses local fallback for reliable basic commands when the backend is unavailable', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          ok: false,
          source: 'modelscope',
          error: { code: 'missing_modelscope_token', message: 'MODELSCOPE_API_TOKEN is not configured.' },
          elapsedMs: 12,
        },
        503,
      ),
    );
    const resolve = createAiCommandResolver({ fetchFn });

    const result = await resolve('画一个红色圆形');

    expect(result).toMatchObject({
      ok: true,
      source: 'local-fallback',
      fromCache: false,
      actions: [{ type: 'create', objectType: 'circle', color: '#ef4444', position: 'center', size: 'medium' }],
    });
    expect(result.error).toContain('MODELSCOPE_API_TOKEN is not configured.');
    expect(result.statusText).toContain(AI_UNAVAILABLE_FALLBACK_MESSAGE);
    expect(result.statusText).toContain('local fallback');
  });

  it('does not execute local fallback for complex commands after backend failure', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    const resolve = createAiCommandResolver({ fetchFn });

    const result = await resolve('帮我整理一张市场活动海报');

    expect(result).toMatchObject({
      ok: false,
      source: 'local-fallback',
      actions: [],
      actionSummary: '本地兜底不可执行复杂指令',
    });
    expect(result.error).toContain('Failed to fetch');
    expect(result.statusText).toContain(AI_UNAVAILABLE_FALLBACK_MESSAGE);
  });

  it('uses local fallback immediately for explicit development preset actions', async () => {
    const fetchFn = vi.fn();
    const resolve = createAiCommandResolver({ fetchFn });

    const result = await resolve('circle', { forceLocalFallback: true });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      source: 'local-fallback',
      actions: [{ type: 'create', objectType: 'circle' }],
      actionSummary: '创建 circle',
    });
  });

  it.each([
    ['撤销', { type: 'undo' }, '撤销上一步'],
    ['重做', { type: 'redo' }, '重做上一步'],
    ['导出图片', { type: 'export', format: 'png' }, '导出图片'],
  ])('uses local fallback immediately for offline edit command: %s', async (command, expectedAction, expectedReason) => {
    const fetchFn = vi.fn();
    const resolve = createAiCommandResolver({ fetchFn });

    const result = await resolve(command);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      source: 'local-fallback',
      actions: [expectedAction],
      reason: expectedReason,
    });
    expect(result.sentContext).toEqual({
      conversation: false,
      canvas: false,
      recentActions: false,
    });
  });

  it('documents the fallback decision boundary', () => {
    expect(shouldUseAiParser('画一个登录流程图', parseLocalCommand('画一个登录流程图'))).toBe(true);
    expect(shouldUseAiParser('画一个红色圆形', parseLocalCommand('画一个红色圆形'))).toBe(true);
    expect(shouldUseAiParser('帮我做一个会动的3D动画', parseLocalCommand('帮我做一个会动的3D动画'))).toBe(true);
    expect(shouldUseAiParser('撤销', parseLocalCommand('撤销'))).toBe(false);
    expect(shouldUseAiParser('重做', parseLocalCommand('重做'))).toBe(false);
    expect(shouldUseAiParser('导出图片', parseLocalCommand('导出图片'))).toBe(false);
    expect(shouldUseAiParser('circle', parseLocalCommand('circle'), { forceLocalFallback: true })).toBe(false);
    expect(shouldUseAiParser('', parseLocalCommand(''))).toBe(false);
  });

  it('creates cache keys from normalized text, canvas revision, and conversation revision', () => {
    expect(createCommandCacheKey(' 画 一个 圆形 ', 2, 3)).toBe('画 一个 圆形::canvas=2::conversation=3');
    expect(createCommandCacheKey('画 一个 圆形', 3, 3)).not.toBe(createCommandCacheKey('画 一个 圆形', 2, 3));
    expect(createCommandCacheKey('画 一个 圆形', 2, 4)).not.toBe(createCommandCacheKey('画 一个 圆形', 2, 3));
  });

  it('allows longer contextual model calls before timing out', () => {
    expect(DEFAULT_AI_COMMAND_TIMEOUT_MS).toBeGreaterThanOrEqual(90000);
  });

  it('summarizes canvas context with order and layer fields', () => {
    const drawingState = createState([
      { type: 'create', objectType: 'circle', color: '#ef4444', position: 'top-left', size: 'small' },
      { type: 'create', objectType: 'rectangle', color: '#2563eb', position: 'bottom-right', size: 'medium' },
    ]);

    expect(createCanvasContext(drawingState)).toMatchObject({
      width: 800,
      height: 500,
      objectCount: 2,
      objects: [
        expect.objectContaining({ id: 'drawing-object-1', order: 0, zIndex: 0 }),
        expect.objectContaining({ id: 'drawing-object-2', order: 1, zIndex: 1 }),
      ],
    });
  });
});
