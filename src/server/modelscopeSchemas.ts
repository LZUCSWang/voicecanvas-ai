import { z } from 'zod';
import {
  DRAWING_LAYER_CHANGES,
  DRAWING_OBJECT_TYPES,
  DRAWING_POSITIONS,
  DRAWING_SIZES,
  DRAWING_STROKE_STYLES,
  DRAWING_TARGET_STRATEGIES,
  type DrawAction,
} from '../domain/drawingTypes';
import { SCENE_TEMPLATE_TYPES } from '../features/scenes/sceneTemplates';

export const parseCommandRequestSchema = z
  .object({
    text: z.string().trim().min(1, 'text is required'),
    conversation: z
      .array(
        z
          .object({
            text: z.string().trim().min(1),
            source: z.string().optional(),
            feedback: z.string().optional(),
            error: z.string().optional(),
            actionSummary: z.string().optional(),
            elapsedMs: z.number().optional(),
            createdAt: z.string().optional(),
          })
          .passthrough(),
      )
      .max(10)
      .optional(),
    canvas: z
      .object({
        width: z.number().positive().optional(),
        height: z.number().positive().optional(),
        objectCount: z.number().nonnegative().optional(),
        objects: z
          .array(
            z
              .object({
                id: z.string().min(1),
                type: z.string().min(1),
                text: z.string().optional(),
                color: z.string().optional(),
                position: z.string().optional(),
                bounds: z.unknown().optional(),
                style: z.unknown().optional(),
                order: z.number().optional(),
                zIndex: z.number().optional(),
                layerOrder: z.number().optional(),
                createdOrder: z.number().optional(),
              })
              .passthrough(),
          )
          .max(80)
          .optional(),
      })
      .passthrough()
      .optional(),
    recentActions: z.array(z.unknown()).max(20).optional(),
  })
  .strict();

export type ParseCommandRequest = z.infer<typeof parseCommandRequestSchema>;

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

export const drawActionSchema = z.discriminatedUnion('type', [
  createDrawingActionSchema,
  updateDrawingActionSchema,
  deleteDrawingActionSchema,
  clearDrawingActionSchema,
]);

export const scenePlanSchema = z
  .object({
    template: z.enum(SCENE_TEMPLATE_TYPES),
    title: z.string().trim().min(1),
    items: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

export type ScenePlan = z.infer<typeof scenePlanSchema>;
export type ModelParserOutput = { actions: DrawAction[] } | { scenePlan: ScenePlan };

export const modelParserOutputSchema = z.union([
  z
    .object({
      actions: z.array(drawActionSchema).min(1),
    })
    .strict(),
  z
    .object({
      scenePlan: scenePlanSchema,
    })
    .strict(),
]);

export function coerceModelParserOutput(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  if ('scenePlan' in input) {
    return {
      scenePlan: coerceScenePlan(input.scenePlan),
    };
  }

  if (!Array.isArray(input.actions)) {
    return input;
  }

  return {
    actions: input.actions.map(coerceDrawAction),
  };
}

export const tokenUsageSchema = z
  .object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    total_tokens: z.number().optional(),
  })
  .passthrough();

export type TokenUsage = z.infer<typeof tokenUsageSchema>;

function coerceScenePlan(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  return pickDefined({
    template: input.template,
    title: input.title,
    items: input.items,
  });
}

function coerceDrawAction(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  const type = normalizeActionType(input.type);

  if (type === 'update') {
    return pickDefined({
      type,
      targetId: stringValue(input.targetId),
      target: coerceTargetSelector(input.target, input),
      changes: coerceUpdateChanges(input.changes),
    });
  }

  if (type === 'delete') {
    return pickDefined({
      type,
      targetId: stringValue(input.targetId),
      target: coerceTargetSelector(input.target, input),
    });
  }

  if (type === 'create') {
    return pickDefined({
      type,
      objectType: normalizeObjectType(input.objectType),
      color: normalizeColor(input.color),
      position: normalizePosition(input.position),
      size: normalizeSize(input.size),
      text: stringValue(input.text),
      style: coerceCanvasObjectStyle(input.style),
      customBounds: input.customBounds,
      customLine: input.customLine,
      customGeometry: coerceFreeformGeometry(input.customGeometry ?? input.geometry),
    });
  }

  if (type === 'clear') {
    return { type };
  }

  return input;
}

function coerceTargetSelector(targetInput: unknown, actionInput: Record<string, unknown>): unknown {
  const target = isRecord(targetInput) ? targetInput : {};
  const objectType = normalizeObjectType(target.objectType ?? target.type ?? actionInput.objectType ?? actionInput.targetType);
  const color = normalizeColor(target.color ?? actionInput.color);
  const position = normalizePosition(target.position ?? actionInput.position);
  const textIncludes = stringValue(target.textIncludes ?? actionInput.textIncludes);
  const id = stringValue(target.id ?? actionInput.id);
  const strategy = normalizeTargetStrategy(target.strategy ?? actionInput.strategy);
  const coerced = pickDefined({
    id,
    objectType,
    color,
    position,
    textIncludes,
    strategy: strategy ?? (objectType || color || position || textIncludes ? 'latest' : undefined),
  });

  return Object.keys(coerced).length > 0 ? coerced : undefined;
}

function coerceUpdateChanges(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  const style = isRecord(input.style) ? input.style : {};

  return pickDefined({
    color: normalizeColor(input.color),
    position: normalizePosition(input.position),
    size: normalizeSize(input.size),
    text: stringValue(input.text),
    translate: coercePointDelta(input.translate),
    scale: positiveNumber(input.scale),
    resize: coerceSizeDelta(input.resize),
    strokeWidthDelta: numberValue(input.strokeWidthDelta ?? style.strokeWidthDelta) ?? coerceStrokeWidthDelta(input.strokeWidth),
    strokeStyle: normalizeStrokeStyle(input.strokeStyle ?? style.strokeStyle),
    fillOpacityDelta: numberValue(input.fillOpacityDelta ?? style.fillOpacityDelta ?? input.fillOpacity ?? style.fillOpacity),
    style: coerceCanvasObjectStyle(input.absoluteStyle ?? input.styleValues ?? input.style),
    geometry: coerceFreeformGeometry(input.geometry ?? input.customGeometry),
    layer: normalizeLayer(input.layer),
  });
}

function coerceCanvasObjectStyle(input: unknown): unknown {
  if (!isRecord(input)) {
    return undefined;
  }

  return pickDefined({
    strokeWidth: positiveNumber(input.strokeWidth),
    strokeStyle: normalizeStrokeStyle(input.strokeStyle),
    fillOpacity: boundedNumber(input.fillOpacity, 0, 1),
    cornerRadius: nonnegativeNumber(input.cornerRadius ?? input.rx ?? input.borderRadius),
    cornerRadiusX: nonnegativeNumber(input.cornerRadiusX),
    cornerRadiusY: nonnegativeNumber(input.cornerRadiusY),
    arrowHeadSize: positiveNumber(input.arrowHeadSize),
    lineCap: normalizeLineCap(input.lineCap),
    lineJoin: normalizeLineJoin(input.lineJoin),
    dashArray: stringValue(input.dashArray),
  });
}

function coerceFreeformGeometry(input: unknown): unknown {
  if (!isRecord(input)) {
    return undefined;
  }

  const kind = normalizeGeometryKind(input.kind ?? input.type);

  if (kind === 'circle') {
    return pickDefined({
      kind,
      cx: numberValue(input.cx),
      cy: numberValue(input.cy),
      radius: positiveNumber(input.radius ?? input.r),
    });
  }

  if (kind === 'rectangle') {
    return pickDefined({
      kind,
      x: numberValue(input.x),
      y: numberValue(input.y),
      width: positiveNumber(input.width),
      height: positiveNumber(input.height),
      rx: nonnegativeNumber(input.rx ?? input.cornerRadius ?? input.borderRadius),
      ry: nonnegativeNumber(input.ry ?? input.cornerRadiusY ?? input.cornerRadius ?? input.borderRadius),
    });
  }

  if (kind === 'line' || kind === 'arrow') {
    return pickDefined({
      kind,
      start: coercePoint(input.start),
      end: coercePoint(input.end),
    });
  }

  if (kind === 'polyline') {
    return pickDefined({
      kind,
      points: Array.isArray(input.points) ? input.points.map(coercePoint).filter(Boolean) : undefined,
    });
  }

  if (kind === 'curve') {
    return pickDefined({
      kind,
      start: coercePoint(input.start),
      control1: coercePoint(input.control1 ?? input.c1),
      control2: coercePoint(input.control2 ?? input.c2),
      end: coercePoint(input.end),
    });
  }

  return undefined;
}

function coercePoint(input: unknown): unknown {
  if (!isRecord(input)) {
    return undefined;
  }

  const x = numberValue(input.x);
  const y = numberValue(input.y);

  if (x === undefined || y === undefined) {
    return undefined;
  }

  return { x, y };
}

function coercePointDelta(input: unknown): unknown {
  if (!isRecord(input)) {
    return undefined;
  }

  const dx = numberValue(input.dx);
  const dy = numberValue(input.dy);

  if (dx === undefined || dy === undefined) {
    return undefined;
  }

  return { dx, dy };
}

function coerceSizeDelta(input: unknown): unknown {
  if (!isRecord(input)) {
    return undefined;
  }

  const dw = numberValue(input.dw);
  const dh = numberValue(input.dh);

  if (dw === undefined || dh === undefined) {
    return undefined;
  }

  return { dw, dh };
}

function normalizeActionType(input: unknown): unknown {
  if (input === 'modify' || input === 'style' || input === 'adjust') {
    return 'update';
  }

  return input;
}

function normalizeObjectType(input: unknown): unknown {
  if (typeof input !== 'string') {
    return undefined;
  }

  const normalized = input.trim().toLowerCase();
  const labels: Record<string, string> = {
    圆: 'circle',
    圆形: 'circle',
    circle: 'circle',
    矩形: 'rectangle',
    长方形: 'rectangle',
    rectangle: 'rectangle',
    rect: 'rectangle',
    三角形: 'triangle',
    triangle: 'triangle',
    箭头: 'arrow',
    arrow: 'arrow',
    直线: 'line',
    线条: 'line',
    line: 'line',
    文字: 'text',
    文本: 'text',
    草稿文字: 'text',
    text: 'text',
  };

  return labels[normalized] ?? input;
}

function normalizeColor(input: unknown): unknown {
  if (typeof input !== 'string') {
    return undefined;
  }

  const normalized = input.trim().toLowerCase();
  const labels: Record<string, string> = {
    红: '#ef4444',
    红色: '#ef4444',
    red: '#ef4444',
    蓝: '#2563eb',
    蓝色: '#2563eb',
    blue: '#2563eb',
    绿: '#16a34a',
    绿色: '#16a34a',
    green: '#16a34a',
    黄: '#d97706',
    黄色: '#d97706',
    yellow: '#d97706',
    黑: '#111827',
    黑色: '#111827',
    black: '#111827',
    白: '#ffffff',
    白色: '#ffffff',
    white: '#ffffff',
    紫: '#7c3aed',
    紫色: '#7c3aed',
    purple: '#7c3aed',
    橙: '#f97316',
    橙色: '#f97316',
    orange: '#f97316',
  };

  return labels[normalized] ?? input;
}

function normalizePosition(input: unknown): unknown {
  if (typeof input !== 'string') {
    return undefined;
  }

  const normalized = input.trim().toLowerCase();
  const labels: Record<string, string> = {
    中间: 'center',
    中央: 'center',
    中心: 'center',
    center: 'center',
    左上角: 'top-left',
    'top-left': 'top-left',
    右上角: 'top-right',
    'top-right': 'top-right',
    左下角: 'bottom-left',
    'bottom-left': 'bottom-left',
    右下角: 'bottom-right',
    'bottom-right': 'bottom-right',
    左侧: 'left',
    左边: 'left',
    left: 'left',
    右侧: 'right',
    右边: 'right',
    right: 'right',
    上方: 'top',
    顶部: 'top',
    top: 'top',
    下方: 'bottom',
    底部: 'bottom',
    bottom: 'bottom',
  };

  return labels[normalized] ?? input;
}

function normalizeSize(input: unknown): unknown {
  if (typeof input !== 'string') {
    return undefined;
  }

  const normalized = input.trim().toLowerCase();
  const labels: Record<string, string> = {
    小: 'small',
    小号: 'small',
    small: 'small',
    中: 'medium',
    中号: 'medium',
    medium: 'medium',
    大: 'large',
    大号: 'large',
    large: 'large',
  };

  return labels[normalized] ?? input;
}

function normalizeTargetStrategy(input: unknown): unknown {
  if (input === 'latest' || input === 'first' || input === 'last') {
    return input;
  }

  if (input === '最近' || input === '最后一个' || input === 'lastest') {
    return 'latest';
  }

  if (input === '第一个' || input === '最早') {
    return 'first';
  }

  return undefined;
}

function normalizeStrokeStyle(input: unknown): unknown {
  if (input === 'solid' || input === 'dashed') {
    return input;
  }

  if (input === '实线') {
    return 'solid';
  }

  if (input === '虚线') {
    return 'dashed';
  }

  return undefined;
}

function normalizeGeometryKind(input: unknown): unknown {
  if (typeof input !== 'string') {
    return undefined;
  }

  const normalized = input.trim().toLowerCase();
  const labels: Record<string, string> = {
    circle: 'circle',
    圆: 'circle',
    圆形: 'circle',
    rectangle: 'rectangle',
    rect: 'rectangle',
    矩形: 'rectangle',
    圆角矩形: 'rectangle',
    line: 'line',
    直线: 'line',
    arrow: 'arrow',
    箭头: 'arrow',
    polyline: 'polyline',
    折线: 'polyline',
    折线箭头: 'polyline',
    curve: 'curve',
    curved: 'curve',
    bezier: 'curve',
    贝塞尔: 'curve',
    曲线: 'curve',
    弯曲箭头: 'curve',
  };

  return labels[normalized] ?? undefined;
}

function normalizeLineCap(input: unknown): unknown {
  if (input === 'butt' || input === 'round' || input === 'square') {
    return input;
  }

  if (input === '圆头') {
    return 'round';
  }

  return undefined;
}

function normalizeLineJoin(input: unknown): unknown {
  if (input === 'miter' || input === 'round' || input === 'bevel') {
    return input;
  }

  if (input === '圆角') {
    return 'round';
  }

  return undefined;
}

function normalizeLayer(input: unknown): unknown {
  if (input === 'front' || input === 'back' || input === 'forward' || input === 'backward') {
    return input;
  }

  const labels: Record<string, string> = {
    置顶: 'front',
    最上层: 'front',
    置底: 'back',
    最底层: 'back',
    前移一层: 'forward',
    上移一层: 'forward',
    后移一层: 'backward',
    下移一层: 'backward',
  };

  return typeof input === 'string' ? labels[input.trim()] : undefined;
}

function coerceStrokeWidthDelta(input: unknown): number | undefined {
  const value = numberValue(input);

  if (value === undefined || value === 0) {
    return undefined;
  }

  return value > 0 ? 1 : -1;
}

function stringValue(input: unknown): string | undefined {
  return typeof input === 'string' && input.trim() ? input.trim() : undefined;
}

function numberValue(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isFinite(input) ? input : undefined;
}

function positiveNumber(input: unknown): number | undefined {
  const value = numberValue(input);
  return value !== undefined && value > 0 ? value : undefined;
}

function nonnegativeNumber(input: unknown): number | undefined {
  const value = numberValue(input);
  return value !== undefined && value >= 0 ? value : undefined;
}

function boundedNumber(input: unknown, min: number, max: number): number | undefined {
  const value = numberValue(input);
  return value === undefined ? undefined : Math.min(max, Math.max(min, value));
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function pickDefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
