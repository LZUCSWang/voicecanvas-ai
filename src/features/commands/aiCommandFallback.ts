import { z } from 'zod';
import {
  DRAWING_LAYER_CHANGES,
  DRAWING_OBJECT_TYPES,
  DRAWING_POSITIONS,
  DRAWING_SIZES,
  DRAWING_STROKE_STYLES,
  DRAWING_TARGET_STRATEGIES,
  type CanvasObject,
  type DrawAction,
  type DrawingHistoryAction,
  type DrawingState,
  type SvgBounds,
} from '../../domain/drawingTypes';
import { createInitialDrawingState } from '../../domain/drawingState';
import {
  createSceneTemplateActions,
  SCENE_TEMPLATE_TYPES,
  type SceneTemplateType,
} from '../scenes/sceneTemplates';
import { formatDrawActions, resolveDevelopmentActions } from '../developmentActions';
import { normalizeCommandText, parseLocalCommand, type LocalCommandParseResult } from './localCommandParser';

export const AI_UNAVAILABLE_FALLBACK_MESSAGE =
  'AI 解析暂不可用，已切换到本地基础兜底；复杂微调需要恢复云端解析后再试';
export const AI_FALLBACK_UNAVAILABLE_MESSAGE = AI_UNAVAILABLE_FALLBACK_MESSAGE;

export type CommandParseSource = 'ai' | 'local-fallback';

export interface CommandConversationItem {
  text: string;
  source?: CommandParseSource | 'local' | 'preset' | string;
  feedback?: string;
  error?: string;
  actionSummary?: string;
  elapsedMs?: number;
  createdAt?: string;
}

export interface CanvasObjectContext {
  id: string;
  type: CanvasObject['type'];
  text?: string;
  color: string;
  position: CanvasObject['position'];
  bounds: SvgBounds;
  geometry: CanvasObject['geometry'];
  style: NonNullable<CanvasObject['style']>;
  order: number;
  zIndex: number;
  layerOrder: number;
  createdOrder: number;
}

export interface CanvasContext {
  width: number;
  height: number;
  objectCount: number;
  objects: CanvasObjectContext[];
}

export interface AiCommandPayload {
  text: string;
  conversation: CommandConversationItem[];
  canvas: CanvasContext;
  recentActions: DrawAction[];
}

export interface CommandParseResolution {
  ok: boolean;
  source: CommandParseSource;
  actions: DrawingHistoryAction[];
  normalizedText: string;
  reason: string;
  elapsedMs: number;
  fromCache: boolean;
  sceneType: SceneTemplateType | null;
  actionSummary: string;
  statusText: string;
  feedbackText: string;
  contextSummary: string;
  sentContext: {
    conversation: boolean;
    canvas: boolean;
    recentActions: boolean;
  };
  error?: string;
}

export interface AiCommandResolverOptions {
  endpoint?: string;
  fetchFn?: typeof fetch;
  now?: () => number;
  cache?: Map<string, CommandParseResolution>;
  timeoutMs?: number;
}

export interface ResolveCommandContext {
  drawingState?: DrawingState;
  conversation?: CommandConversationItem[];
  recentActions?: DrawAction[];
  canvasRevision?: number;
  conversationRevision?: number;
  forceLocalFallback?: boolean;
}

type ModelParserOutput = { actions: DrawAction[] } | { scenePlan: AiScenePlan };
type LocalFallbackReason = 'explicit-development-preset' | 'offline-edit-command' | 'backend-unavailable';

interface AiScenePlan {
  template: SceneTemplateType;
  title: string;
  items: string[];
}

const DEFAULT_ENDPOINT = '/api/parse-command';
export const DEFAULT_AI_COMMAND_TIMEOUT_MS = 90000;

const drawingObjectTypeSchema = z.enum(DRAWING_OBJECT_TYPES);
const drawingPositionSchema = z.enum(DRAWING_POSITIONS);
const drawingSizeSchema = z.enum(DRAWING_SIZES);
const drawingTargetStrategySchema = z.enum(DRAWING_TARGET_STRATEGIES);
const drawingStrokeStyleSchema = z.enum(DRAWING_STROKE_STYLES);
const drawingLayerChangeSchema = z.enum(DRAWING_LAYER_CHANGES);

const svgPointSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .strict();

const svgBoundsSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict();

const canvasObjectStyleSchema = z
  .object({
    strokeWidth: z.number().positive().optional(),
    strokeStyle: drawingStrokeStyleSchema.optional(),
    fillOpacity: z.number().min(0).max(1).optional(),
    cornerRadius: z.number().nonnegative().optional(),
    cornerRadiusX: z.number().nonnegative().optional(),
    cornerRadiusY: z.number().nonnegative().optional(),
    arrowHeadSize: z.number().positive().optional(),
    lineCap: z.enum(['butt', 'round', 'square']).optional(),
    lineJoin: z.enum(['miter', 'round', 'bevel']).optional(),
    dashArray: z.string().min(1).optional(),
  })
  .strict();

const freeformGeometrySchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('circle'),
      cx: z.number(),
      cy: z.number(),
      radius: z.number().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('rectangle'),
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
      rx: z.number().nonnegative().optional(),
      ry: z.number().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.enum(['line', 'arrow']),
      start: svgPointSchema,
      end: svgPointSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('polyline'),
      points: z.array(svgPointSchema).min(2).max(12),
    })
    .strict(),
  z
    .object({
      kind: z.literal('curve'),
      start: svgPointSchema,
      control1: svgPointSchema,
      control2: svgPointSchema,
      end: svgPointSchema,
    })
    .strict(),
]);

const drawingTargetSelectorSchema = z
  .object({
    id: z.string().min(1).optional(),
    objectType: drawingObjectTypeSchema.optional(),
    color: z.string().min(1).optional(),
    position: drawingPositionSchema.optional(),
    textIncludes: z.string().min(1).optional(),
    strategy: drawingTargetStrategySchema.optional(),
  })
  .strict();

const updateDrawingChangesSchema = z
  .object({
    color: z.string().min(1).optional(),
    position: drawingPositionSchema.optional(),
    size: drawingSizeSchema.optional(),
    text: z.string().optional(),
    translate: z
      .object({
        dx: z.number(),
        dy: z.number(),
      })
      .strict()
      .optional(),
    scale: z.number().positive().optional(),
    resize: z
      .object({
        dw: z.number(),
        dh: z.number(),
      })
      .strict()
      .optional(),
    strokeWidthDelta: z.number().optional(),
    strokeStyle: drawingStrokeStyleSchema.optional(),
    fillOpacityDelta: z.number().optional(),
    style: canvasObjectStyleSchema.optional(),
    geometry: freeformGeometrySchema.optional(),
    layer: drawingLayerChangeSchema.optional(),
  })
  .strict()
  .refine((changes) => Object.values(changes).some((value) => value !== undefined), {
    message: 'update changes must include at least one field',
  });

const createDrawingActionSchema = z
  .object({
    type: z.literal('create'),
    objectType: drawingObjectTypeSchema,
    color: z.string().min(1).optional(),
    position: drawingPositionSchema.optional(),
    size: drawingSizeSchema.optional(),
    text: z.string().optional(),
    style: canvasObjectStyleSchema.optional(),
    customBounds: svgBoundsSchema.optional(),
    customLine: z
      .object({
        start: svgPointSchema,
        end: svgPointSchema,
      })
      .strict()
      .optional(),
    customGeometry: freeformGeometrySchema.optional(),
  })
  .strict();

const updateDrawingActionSchema = z
  .object({
    type: z.literal('update'),
    targetId: z.string().min(1).optional(),
    target: drawingTargetSelectorSchema.optional(),
    changes: updateDrawingChangesSchema,
  })
  .strict();

const deleteDrawingActionSchema = z
  .object({
    type: z.literal('delete'),
    targetId: z.string().min(1).optional(),
    target: drawingTargetSelectorSchema.optional(),
  })
  .strict();

const clearDrawingActionSchema = z
  .object({
    type: z.literal('clear'),
  })
  .strict();

export const frontendDrawActionSchema = z.discriminatedUnion('type', [
  createDrawingActionSchema,
  updateDrawingActionSchema,
  deleteDrawingActionSchema,
  clearDrawingActionSchema,
]);

export const frontendScenePlanSchema = z
  .object({
    template: z.enum(SCENE_TEMPLATE_TYPES),
    title: z.string().trim().min(1),
    items: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

const modelParserOutputSchema = z.union([
  z
    .object({
      actions: z.array(frontendDrawActionSchema).min(1),
    })
    .strict(),
  z
    .object({
      scenePlan: frontendScenePlanSchema,
    })
    .strict(),
]);

const wrappedSuccessSchema = z
  .object({
    ok: z.literal(true),
    result: modelParserOutputSchema,
    elapsedMs: z.number().optional(),
  })
  .passthrough();

const wrappedFailureSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        message: z.string().optional(),
      })
      .passthrough()
      .optional(),
    elapsedMs: z.number().optional(),
  })
  .passthrough();

export function createAiCommandResolver({
  endpoint = DEFAULT_ENDPOINT,
  fetchFn = fetch,
  now = Date.now,
  cache = new Map<string, CommandParseResolution>(),
  timeoutMs = DEFAULT_AI_COMMAND_TIMEOUT_MS,
}: AiCommandResolverOptions = {}) {
  return async function resolveCommandWithAiFallback(
    text: string,
    context: ResolveCommandContext = {},
  ): Promise<CommandParseResolution> {
    const localResult = parseLocalCommand(text);
    const normalizedText = localResult.normalizedText || normalizeCommandText(text);
    const drawingState = context.drawingState ?? createInitialDrawingState();
    const conversation = context.conversation ?? [];
    const recentActions = context.recentActions ?? [];
    const canvasRevision = context.canvasRevision ?? createCanvasRevision(drawingState);
    const conversationRevision = context.conversationRevision ?? createConversationRevision(conversation);
    const payload = buildAiCommandPayload({
      text,
      normalizedText,
      drawingState,
      conversation,
      recentActions,
    });

    if (!shouldUseAiParser(text, localResult, { forceLocalFallback: context.forceLocalFallback })) {
      const fallbackReason = isOfflineEditCommand(localResult) ? 'offline-edit-command' : 'explicit-development-preset';
      return resolveLocalFallback(text, localResult, normalizedText, fallbackReason, undefined, payload);
    }

    const cacheKey = createCommandCacheKey(normalizedText, canvasRevision, conversationRevision);
    const cached = cache.get(cacheKey);

    if (cached) {
      return cachedResult(cached);
    }

    const startedAt = now();
    let resolution: CommandParseResolution;

    try {
      const response = await fetchWithTimeout(fetchFn, endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }, timeoutMs);
      const responseBody = await readJsonResponse(response);

      if (!response.ok) {
        resolution = resolveLocalFallback(
          text,
          localResult,
          normalizedText,
          'backend-unavailable',
          getBackendErrorMessage(responseBody, response.status),
          payload,
          elapsedMs(now, startedAt),
        );
      } else {
        try {
          const aiOutput = normalizeAiOutputForCommandIntent(text, parseAiParserOutput(responseBody));
          assertAiOutputMatchesCommandIntent(text, aiOutput, drawingState);
          resolution = aiSuccess(normalizedText, aiOutput, elapsedMs(now, startedAt), payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'AI parser returned an invalid response.';
          resolution = resolveLocalFallback(text, localResult, normalizedText, 'backend-unavailable', message, payload, elapsedMs(now, startedAt));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI parser request failed.';
      resolution = resolveLocalFallback(text, localResult, normalizedText, 'backend-unavailable', message, payload, elapsedMs(now, startedAt));
    }

    if (resolution.source === 'ai') {
      cache.set(cacheKey, resolution);
    }

    return resolution;
  };
}

export const resolveCommandWithAiFallback = createAiCommandResolver();

export function shouldUseAiParser(
  text: string,
  localResult: LocalCommandParseResult,
  options: Pick<ResolveCommandContext, 'forceLocalFallback'> = {},
): boolean {
  const normalizedText = localResult.normalizedText || normalizeCommandText(text);

  if (!normalizedText) {
    return false;
  }

  return !options.forceLocalFallback && !isOfflineEditCommand(localResult);
}

export const shouldUseAiFallback = shouldUseAiParser;

function parseAiParserOutput(responseBody: unknown): ModelParserOutput {
  const wrappedSuccess = wrappedSuccessSchema.safeParse(responseBody);

  if (wrappedSuccess.success) {
    return wrappedSuccess.data.result as ModelParserOutput;
  }

  const wrappedFailure = wrappedFailureSchema.safeParse(responseBody);

  if (wrappedFailure.success) {
    throw new Error(wrappedFailure.data.error?.message ?? 'AI parser returned an error.');
  }

  const directOutput = modelParserOutputSchema.safeParse(responseBody);

  if (directOutput.success) {
    return directOutput.data as ModelParserOutput;
  }

  throw new Error('AI 返回内容未通过前端安全校验。');
}

function normalizeAiOutputForCommandIntent(text: string, aiOutput: ModelParserOutput): ModelParserOutput {
  if ('scenePlan' in aiOutput || !isTextSpecificMicroEdit(text)) {
    return aiOutput;
  }

  const textIncludes = getTextSpecificTargetText(aiOutput.actions);

  if (!textIncludes || !asksToBringCorrespondingShapeToFront(text)) {
    return aiOutput;
  }

  const bringsRectangleToFront = aiOutput.actions.some(
    (action) =>
      action.type === 'update' &&
      action.target?.objectType === 'rectangle' &&
      (action.changes.layer === 'front' || action.changes.layer === 'forward'),
  );
  const alreadyBringsTextToFront = aiOutput.actions.some(
    (action) =>
      action.type === 'update' &&
      action.target?.objectType === 'text' &&
      action.target.textIncludes === textIncludes &&
      (action.changes.layer === 'front' || action.changes.layer === 'forward'),
  );

  if (!bringsRectangleToFront || alreadyBringsTextToFront) {
    return aiOutput;
  }

  return {
    actions: [
      ...aiOutput.actions,
      {
        type: 'update',
        target: { objectType: 'text', textIncludes, strategy: 'latest' },
        changes: { layer: 'front' },
      },
    ],
  };
}

function getTextSpecificTargetText(actions: DrawAction[]): string | null {
  for (const action of actions) {
    if ((action.type === 'update' || action.type === 'delete') && action.target?.objectType === 'text' && action.target.textIncludes) {
      return action.target.textIncludes;
    }
  }

  return null;
}

function asksToBringCorrespondingShapeToFront(text: string): boolean {
  const normalizedText = normalizeCommandText(text);

  return /(对应|相关|所在|背后|同一).*(矩形|模块|框|shape|rectangle).*(置顶|前面|最上层|front)/i.test(normalizedText);
}

function assertAiOutputMatchesCommandIntent(text: string, aiOutput: ModelParserOutput, drawingState: DrawingState): void {
  if ('scenePlan' in aiOutput || !isTextSpecificMicroEdit(text) || mentionsConnectorTarget(text)) {
    return;
  }

  const unsafeAction = aiOutput.actions.find((action) => isUnsafeTextSpecificAction(action, drawingState));

  if (unsafeAction) {
    throw new Error('AI 返回微调动作与文字目标不匹配。');
  }
}

function isTextSpecificMicroEdit(text: string): boolean {
  const normalizedText = normalizeCommandText(text);

  return /[“"']/.test(text) && /(文字|文本|包含|标签|text|label)/i.test(normalizedText);
}

function mentionsConnectorTarget(text: string): boolean {
  return /(箭头|连接线|连线|线条|connector|arrow|line)/i.test(normalizeCommandText(text));
}

function isUnsafeTextSpecificAction(action: DrawAction, drawingState: DrawingState): boolean {
  if (action.type !== 'update' && action.type !== 'delete') {
    return false;
  }

  const targetId = action.targetId ?? action.target?.id;
  const targetObject = targetId ? drawingState.objects.find((object) => object.id === targetId) : undefined;

  if (targetObject) {
    return !isTextRelatedObjectType(targetObject.type);
  }

  const target = action.target;

  if (!target) {
    return true;
  }

  if (target.objectType) {
    return !isTextRelatedObjectType(target.objectType);
  }

  return !target.textIncludes;
}

function isTextRelatedObjectType(objectType: CanvasObject['type']): boolean {
  return objectType === 'text' || objectType === 'rectangle';
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error('AI parser returned unreadable JSON.');
  }
}

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  endpoint: string,
  requestInit: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  if (timeoutMs <= 0 || typeof AbortController === 'undefined') {
    return fetchFn(endpoint, requestInit);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchFn(endpoint, {
      ...requestInit,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('AI parser request timed out.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveLocalFallback(
  text: string,
  localResult: LocalCommandParseResult,
  normalizedText: string,
  reason: LocalFallbackReason,
  backendError: string | undefined,
  payload: AiCommandPayload,
  elapsedMsValue = 0,
): CommandParseResolution {
  if (reason === 'explicit-development-preset') {
    const presetActions = resolveDevelopmentActions(text);

    if (presetActions) {
      return localSuccess(
        {
          ok: true,
          source: 'local',
          actions: presetActions,
          normalizedText,
          segments: [normalizedText],
          reason: '开发辅助预置 action',
        },
        normalizedText,
        reason,
        backendError,
        payload,
        elapsedMsValue,
      );
    }
  }

  if (localResult.ok && isReliableLocalFallback(localResult.actions, reason, normalizedText)) {
    return localSuccess(localResult, normalizedText, reason, backendError, payload, elapsedMsValue);
  }

  return localFailure(localResult, normalizedText, reason, backendError, payload, elapsedMsValue);
}

export function buildAiCommandPayload({
  text,
  normalizedText,
  drawingState = createInitialDrawingState(),
  conversation = [],
  recentActions = [],
}: {
  text: string;
  normalizedText?: string;
  drawingState?: DrawingState;
  conversation?: CommandConversationItem[];
  recentActions?: DrawAction[];
}): AiCommandPayload {
  return {
    text: (normalizedText || normalizeCommandText(text)).trim(),
    conversation: sanitizeConversation(conversation),
    canvas: createCanvasContext(drawingState),
    recentActions: sanitizeRecentActions(recentActions),
  };
}

function sanitizeConversation(conversation: CommandConversationItem[]): CommandConversationItem[] {
  return conversation.slice(-8).map((item) => ({
    text: limitText(item.text, 240),
    source: item.source,
    feedback: item.feedback ? limitText(item.feedback, 160) : undefined,
    error: item.error ? limitText(item.error, 160) : undefined,
    actionSummary: item.actionSummary ? limitText(item.actionSummary, 160) : undefined,
    elapsedMs: item.elapsedMs,
    createdAt: item.createdAt,
  }));
}

function sanitizeRecentActions(actions: DrawAction[]): DrawAction[] {
  return actions.slice(-16).map((action) => {
    if (action.type === 'create' && action.text) {
      return {
        ...action,
        text: limitText(action.text, 120),
      };
    }

    if (action.type === 'update' && action.changes.text) {
      return {
        ...action,
        changes: {
          ...action.changes,
          text: limitText(action.changes.text, 120),
        },
      };
    }

    return action;
  });
}

function limitText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export function createCanvasContext(state: DrawingState): CanvasContext {
  return {
    width: state.canvas.width,
    height: state.canvas.height,
    objectCount: state.objects.length,
    objects: state.objects.map((object, index) => ({
      id: object.id,
      type: object.type,
      text: object.text,
      color: object.color,
      position: object.position,
      bounds: object.bounds,
      geometry: object.geometry,
      style: {
        strokeWidth: object.style?.strokeWidth,
        strokeStyle: object.style?.strokeStyle,
        fillOpacity: object.style?.fillOpacity,
        cornerRadius: object.style?.cornerRadius,
        cornerRadiusX: object.style?.cornerRadiusX,
        cornerRadiusY: object.style?.cornerRadiusY,
        arrowHeadSize: object.style?.arrowHeadSize,
        lineCap: object.style?.lineCap,
        lineJoin: object.style?.lineJoin,
        dashArray: object.style?.dashArray,
      },
      order: index,
      zIndex: index,
      layerOrder: index,
      createdOrder: parseCreatedOrder(object.id) ?? index + 1,
    })),
  };
}

export function createCommandCacheKey(
  normalizedText: string,
  canvasRevision = 0,
  conversationRevision = 0,
): string {
  return `${normalizedText.trim().toLowerCase()}::canvas=${canvasRevision}::conversation=${conversationRevision}`;
}

function parseCreatedOrder(id: string): number | null {
  const match = id.match(/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function createCanvasRevision(state: DrawingState): number {
  return state.objects.reduce((revision, object, index) => {
    const bounds = object.bounds;
    return (
      revision +
      (index + 1) * 97 +
      object.id.length * 17 +
      object.type.length * 13 +
      object.color.length * 7 +
      object.position.length * 5 +
      Math.round(bounds.x + bounds.y + bounds.width + bounds.height)
    );
  }, state.objects.length * 31 + state.nextObjectNumber);
}

function createConversationRevision(conversation: CommandConversationItem[]): number {
  return conversation.reduce((revision, item, index) => {
    return revision + (index + 1) * 37 + item.text.length * 5 + (item.feedback?.length ?? 0) + (item.error?.length ?? 0);
  }, conversation.length * 19);
}

function isReliableLocalFallback(
  actions: DrawingHistoryAction[],
  reason: LocalFallbackReason,
  normalizedText: string,
): boolean {
  if (reason === 'explicit-development-preset' || reason === 'offline-edit-command') {
    return true;
  }

  if (isOpenEndedLocalFallbackText(normalizedText)) {
    return false;
  }

  if (actions.length === 0) {
    return false;
  }

  if (actions.length === 1) {
    const [action] = actions;

    if (action.type === 'clear') {
      return true;
    }

    if (action.type === 'create') {
      return !action.customBounds && !action.customLine;
    }

    if (action.type === 'update') {
      return isReliableFallbackUpdate(action);
    }

    if (action.type === 'delete') {
      return true;
    }

    if (action.type === 'undo' || action.type === 'redo' || action.type === 'export') {
      return true;
    }
  }

  return false;
}

function isOpenEndedLocalFallbackText(normalizedText: string): boolean {
  return [
    '当前画面',
    '画面里',
    '帮我把',
    '处理',
    '整理',
    '细节',
    '优化',
    '美化',
    '醒目',
    '协调',
  ].some((keyword) => normalizedText.includes(keyword));
}

function isReliableFallbackUpdate(action: Extract<DrawAction, { type: 'update' }>): boolean {
  const changeKeys = Object.entries(action.changes)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);

  if (changeKeys.length === 0) {
    return false;
  }

  return changeKeys.every((key) =>
    ['color', 'position', 'size', 'text', 'translate', 'scale', 'resize', 'strokeWidthDelta', 'strokeStyle', 'fillOpacityDelta', 'layer'].includes(key),
  );
}

function summarizePayloadContext(payload: AiCommandPayload): string {
  return `已携带 canvas/conversation/recentActions 上下文（对象 ${payload.canvas.objectCount} 个，对话 ${payload.conversation.length} 条，动作 ${payload.recentActions.length} 条）`;
}

function getSentContext(_payload: AiCommandPayload): CommandParseResolution['sentContext'] {
  return {
    conversation: true,
    canvas: true,
    recentActions: true,
  };
}

function getLocalFallbackContextSummary(
  reason: LocalFallbackReason,
  payload: AiCommandPayload,
): string {
  return reason === 'explicit-development-preset' || reason === 'offline-edit-command'
    ? '开发预置未请求 AI，上下文未发送'
    : summarizePayloadContext(payload);
}

function getLocalFallbackSentContext(
  reason: LocalFallbackReason,
): CommandParseResolution['sentContext'] {
  if (reason === 'explicit-development-preset' || reason === 'offline-edit-command') {
    return {
      conversation: false,
      canvas: false,
      recentActions: false,
    };
  }

  return {
    conversation: true,
    canvas: true,
    recentActions: true,
  };
}

function localSuccess(
  localResult: LocalCommandParseResult & { ok: true },
  normalizedText: string,
  reason: LocalFallbackReason,
  backendError: string | undefined,
  payload: AiCommandPayload,
  elapsedMsValue = 0,
): CommandParseResolution {
  const actionSummary = formatDrawActions(localResult.actions);
  const fallbackReason = getLocalFallbackReasonText(reason);

  return {
    ok: true,
    source: 'local-fallback',
    actions: localResult.actions,
    normalizedText,
    reason: localResult.reason,
    elapsedMs: elapsedMsValue,
    fromCache: false,
    sceneType: detectSceneTypeFromLocalReason(localResult.reason),
    actionSummary,
    statusText: `${fallbackReason}。本地解析：${localResult.reason}。耗时 ${elapsedMsValue}ms。${actionSummary}${backendError ? `。${backendError}` : ''}`,
    feedbackText: getSuccessFeedbackText(localResult.actions, localResult.reason, null),
    contextSummary: getLocalFallbackContextSummary(reason, payload),
    sentContext: getLocalFallbackSentContext(reason),
    error: backendError,
  };
}

function localFailure(
  localResult: LocalCommandParseResult,
  normalizedText: string,
  reason: LocalFallbackReason,
  backendError: string | undefined,
  payload: AiCommandPayload,
  elapsedMsValue = 0,
): CommandParseResolution {
  const localError = localResult.ok ? '本地兜底只允许执行基础指令。' : localResult.error;
  const actionSummary = reason === 'backend-unavailable' ? '本地兜底不可执行复杂指令' : '未生成动作';

  return {
    ok: false,
    source: 'local-fallback',
    actions: [],
    normalizedText,
    reason: localResult.reason,
    elapsedMs: elapsedMsValue,
    fromCache: false,
    sceneType: null,
    actionSummary,
    statusText:
      reason === 'backend-unavailable'
        ? `${AI_UNAVAILABLE_FALLBACK_MESSAGE}。${localError}${backendError ? `。${backendError}` : ''}`
        : localError,
    feedbackText: '没有听懂，请换一种说法。',
    contextSummary: getLocalFallbackContextSummary(reason, payload),
    sentContext: getLocalFallbackSentContext(reason),
    error: [localError, backendError].filter(Boolean).join(' '),
  };
}

function getLocalFallbackReasonText(reason: LocalFallbackReason): string {
  if (reason === 'backend-unavailable') {
    return `local fallback：${AI_UNAVAILABLE_FALLBACK_MESSAGE}`;
  }

  if (reason === 'offline-edit-command') {
    return '离线编辑命令，直接使用 local fallback';
  }

  return '明确的开发预置 action，直接使用 local fallback';
}

function aiSuccess(
  normalizedText: string,
  aiOutput: ModelParserOutput,
  elapsedMsValue: number,
  payload: AiCommandPayload,
): CommandParseResolution {
  if ('scenePlan' in aiOutput) {
    const actions: DrawAction[] = [
      { type: 'clear' },
      ...createSceneTemplateActions({
        type: aiOutput.scenePlan.template,
        title: aiOutput.scenePlan.title,
        items: aiOutput.scenePlan.items,
      }),
    ];
    const actionSummary = `生成 ${aiOutput.scenePlan.template} 场景`;

    return {
      ok: true,
      source: 'ai',
      actions,
      normalizedText,
      reason: actionSummary,
      elapsedMs: elapsedMsValue,
      fromCache: false,
      sceneType: aiOutput.scenePlan.template,
      actionSummary,
      statusText: `AI解析(ai)：${actionSummary}。耗时 ${elapsedMsValue}ms。${summarizePayloadContext(payload)}`,
      feedbackText: getSuccessFeedbackText(actions, actionSummary, aiOutput.scenePlan.template),
      contextSummary: summarizePayloadContext(payload),
      sentContext: getSentContext(payload),
    };
  }

  const actionSummary = summarizeAiActions(aiOutput.actions);

  return {
    ok: true,
    source: 'ai',
    actions: aiOutput.actions,
    normalizedText,
    reason: actionSummary,
    elapsedMs: elapsedMsValue,
    fromCache: false,
    sceneType: null,
    actionSummary,
    statusText: `AI解析(ai)：${actionSummary}。耗时 ${elapsedMsValue}ms。${summarizePayloadContext(payload)}`,
    feedbackText: getSuccessFeedbackText(aiOutput.actions, actionSummary, null),
    contextSummary: summarizePayloadContext(payload),
    sentContext: getSentContext(payload),
  };
}

function cachedResult(result: CommandParseResolution): CommandParseResolution {
  return {
    ...result,
    elapsedMs: 0,
    fromCache: true,
    statusText: `${result.statusText}（缓存命中）`,
  };
}

function elapsedMs(now: () => number, startedAt: number): number {
  return Math.max(0, Math.round(now() - startedAt));
}

function getBackendErrorMessage(responseBody: unknown, status: number): string {
  const backendFailure = wrappedFailureSchema.safeParse(responseBody);

  if (backendFailure.success) {
    return backendFailure.data.error?.message ?? `AI parser request failed with status ${status}.`;
  }

  return `AI parser request failed with status ${status}.`;
}

function summarizeAiActions(actions: DrawAction[]): string {
  const fineTuneCount = actions.filter((action) => action.type === 'update' || action.type === 'delete').length;

  if (fineTuneCount === actions.length) {
    return `微调动作 ${actions.length} 个`;
  }

  return formatDrawActions(actions);
}

function detectSceneTypeFromLocalReason(reason: string): SceneTemplateType | null {
  if (reason.includes('流程图')) {
    return 'flowchart';
  }

  if (reason.includes('架构图')) {
    return 'architecture';
  }

  if (reason.includes('思维导图')) {
    return 'mind-map';
  }

  if (reason.includes('对比图')) {
    return 'comparison';
  }

  if (reason.includes('海报')) {
    return 'poster';
  }

  return null;
}

function getSuccessFeedbackText(actions: DrawingHistoryAction[], reason: string, sceneType: SceneTemplateType | null): string {
  if (sceneType) {
    return `已生成${formatSceneType(sceneType)}`;
  }

  if (reason.includes('流程图')) {
    return '已生成流程图';
  }

  if (reason.includes('对比图')) {
    return '已生成对比图';
  }

  if (reason.includes('架构图')) {
    return '已生成架构图';
  }

  if (reason.includes('思维导图')) {
    return '已生成思维导图';
  }

  if (reason.includes('海报')) {
    return '已生成海报';
  }

  if (actions.length === 1 && actions[0].type === 'clear') {
    return '已清空画布';
  }

  if (actions.length === 1 && actions[0].type === 'undo') {
    return '已撤销上一步';
  }

  if (actions.length === 1 && actions[0].type === 'redo') {
    return '已重做上一步';
  }

  if (actions.length === 1 && actions[0].type === 'export') {
    return '正在导出图片';
  }

  if (actions.every((action) => action.type === 'update' || action.type === 'delete')) {
    return '已执行微调';
  }

  const createdObjectType = actions.find((action) => action.type === 'create')?.objectType;

  if (createdObjectType) {
    return `已画${createdObjectType}`;
  }

  return '已执行绘图指令';
}

function isOfflineEditCommand(localResult: LocalCommandParseResult): boolean {
  return (
    localResult.ok &&
    localResult.actions.length === 1 &&
    (localResult.actions[0].type === 'clear' ||
      localResult.actions[0].type === 'undo' ||
      localResult.actions[0].type === 'redo' ||
      localResult.actions[0].type === 'export')
  );
}

function formatSceneType(sceneType: SceneTemplateType): string {
  const labels: Record<SceneTemplateType, string> = {
    flowchart: '流程图',
    'mind-map': '思维导图',
    comparison: '对比图',
    architecture: '架构图',
    poster: '海报',
  };

  return labels[sceneType];
}
