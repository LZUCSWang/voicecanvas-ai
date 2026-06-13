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
  })
  .strict();

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
  })
  .strict();

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

export const tokenUsageSchema = z
  .object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    total_tokens: z.number().optional(),
  })
  .passthrough();

export type TokenUsage = z.infer<typeof tokenUsageSchema>;
