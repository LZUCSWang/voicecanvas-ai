import { getBoundsForPosition, getDrawingSizeSpec } from './drawingState';
import type {
  CanvasObject,
  CanvasObjectStyle,
  CreateDrawingAction,
  DeleteDrawingAction,
  DrawAction,
  DrawingGeometry,
  DrawingObjectType,
  DrawingPosition,
  DrawingSize,
  DrawingState,
  DrawingTargetSelector,
  SvgBounds,
  SvgPoint,
  UpdateDrawingAction,
  UpdateDrawingChanges,
} from './drawingTypes';

const DEFAULT_OBJECT_COLOR = '#111827';
const DEFAULT_OBJECT_POSITION: DrawingPosition = 'center';
const DEFAULT_OBJECT_SIZE: DrawingSize = 'medium';
const DEFAULT_TEXT_VALUE = 'Text';
const MIN_OBJECT_SIDE = 12;
const MIN_STROKE_WIDTH = 1;
const MAX_STROKE_WIDTH = 24;
const DEFAULT_TRANSLATE_STEP = 24;

const DEFAULT_FILL_OPACITY: Record<DrawingObjectType, number> = {
  circle: 0.16,
  rectangle: 0.14,
  triangle: 0.14,
  line: 0,
  arrow: 0,
  text: 1,
};

export interface DrawingActionExecutionResult {
  action: DrawAction;
  state: DrawingState;
  changed: boolean;
  targetBefore?: CanvasObject;
  targetAfter?: CanvasObject;
  targetDescription?: string;
  feedbackText: string;
}

export function executeDrawingAction(state: DrawingState, action: DrawAction): DrawingState {
  return executeDrawingActionWithResult(state, action).state;
}

export function executeDrawingActionWithResult(state: DrawingState, action: DrawAction): DrawingActionExecutionResult {
  switch (action.type) {
    case 'create':
      return createObject(state, action);
    case 'update':
      return updateObject(state, action);
    case 'delete':
      return deleteObject(state, action);
    case 'clear':
      return result(
        action,
        {
          ...state,
          objects: [],
          nextObjectNumber: 1,
        },
        state.objects.length > 0,
        '已清空画布',
      );
  }
}

function createObject(state: DrawingState, action: CreateDrawingAction): DrawingActionExecutionResult {
  const object = buildCanvasObject({
    id: createObjectId(state.nextObjectNumber),
    type: action.objectType,
    color: action.color ?? DEFAULT_OBJECT_COLOR,
    position: action.position ?? DEFAULT_OBJECT_POSITION,
    size: action.size ?? DEFAULT_OBJECT_SIZE,
    text: action.text,
    style: action.style,
    customBounds: action.customBounds,
    customLine: action.customLine,
    state,
  });

  return result(
    action,
    {
      ...state,
      objects: [...state.objects, object],
      nextObjectNumber: state.nextObjectNumber + 1,
    },
    true,
    `已画${formatObjectType(action.objectType)}`,
    undefined,
    object,
  );
}

function updateObject(state: DrawingState, action: UpdateDrawingAction): DrawingActionExecutionResult {
  const resolution = resolveTargetObject(state.objects, action.targetId, action.target);

  if (resolution.index < 0) {
    return result(action, state, false, `未找到${describeMissingTarget(action.targetId, action.target)}`);
  }

  const currentObject = state.objects[resolution.index];
  const targetDescription = describeResolvedTarget(currentObject, action.targetId, action.target);
  const nextObject = applyObjectChanges(currentObject, action.changes, state);
  const replacedObjects = state.objects.map((object, index) => (index === resolution.index ? nextObject : object));
  const layerResult = applyLayerChange(replacedObjects, resolution.index, action.changes.layer);
  const targetAfter = layerResult.objects[layerResult.targetIndex];

  return result(
    action,
    {
      ...state,
      objects: layerResult.objects,
    },
    true,
    `已把${targetDescription}${describeUpdateChange(action.changes, currentObject)}`,
    currentObject,
    targetAfter,
    targetDescription,
  );
}

function deleteObject(state: DrawingState, action: DeleteDrawingAction): DrawingActionExecutionResult {
  const resolution = resolveTargetObject(state.objects, action.targetId, action.target);

  if (resolution.index < 0) {
    return result(action, state, false, `未找到${describeMissingTarget(action.targetId, action.target)}`);
  }

  const targetBefore = state.objects[resolution.index];
  const targetDescription = describeResolvedTarget(targetBefore, action.targetId, action.target);

  return result(
    action,
    {
      ...state,
      objects: state.objects.filter((_, index) => index !== resolution.index),
    },
    true,
    `已删除${targetDescription}`,
    targetBefore,
    undefined,
    targetDescription,
  );
}

function result(
  action: DrawAction,
  state: DrawingState,
  changed: boolean,
  feedbackText: string,
  targetBefore?: CanvasObject,
  targetAfter?: CanvasObject,
  targetDescription?: string,
): DrawingActionExecutionResult {
  return {
    action,
    state,
    changed,
    feedbackText,
    targetBefore,
    targetAfter,
    targetDescription,
  };
}

function resolveTargetObject(
  objects: CanvasObject[],
  targetId?: string,
  target?: DrawingTargetSelector,
): { index: number; candidates: CanvasObject[] } {
  const effectiveTarget: DrawingTargetSelector | undefined = targetId ? { ...target, id: targetId } : target;

  if (!effectiveTarget || Object.keys(effectiveTarget).length === 0) {
    const index = objects.length - 1;
    return { index, candidates: index >= 0 ? [objects[index]] : [] };
  }

  const candidates = objects.filter((object) => matchesTarget(object, effectiveTarget));

  if (candidates.length === 0) {
    return { index: -1, candidates: [] };
  }

  const selectedObject = effectiveTarget.strategy === 'first' ? candidates[0] : candidates[candidates.length - 1];

  return {
    index: objects.findIndex((object) => object.id === selectedObject.id),
    candidates,
  };
}

function matchesTarget(object: CanvasObject, target: DrawingTargetSelector): boolean {
  if (target.id && object.id !== target.id) {
    return false;
  }

  if (target.objectType && object.type !== target.objectType) {
    return false;
  }

  if (target.color && object.color !== target.color) {
    return false;
  }

  if (target.position && object.position !== target.position) {
    return false;
  }

  if (target.textIncludes && !object.text?.includes(target.textIncludes)) {
    return false;
  }

  return true;
}

function applyObjectChanges(object: CanvasObject, changes: UpdateDrawingChanges, state: DrawingState): CanvasObject {
  let nextObject: CanvasObject = {
    ...object,
    color: changes.color ?? object.color,
    text: object.type === 'text' ? changes.text ?? object.text : object.text,
  };

  if (changes.position || changes.size) {
    nextObject = buildCanvasObject({
      id: nextObject.id,
      type: nextObject.type,
      color: nextObject.color,
      position: changes.position ?? nextObject.position,
      size: changes.size ?? nextObject.size,
      text: nextObject.text,
      style: nextObject.style,
      state,
    });
  }

  if (changes.translate) {
    nextObject = translateObject(nextObject, changes.translate.dx, changes.translate.dy);
  }

  if (typeof changes.scale === 'number') {
    nextObject = scaleObject(nextObject, changes.scale);
  }

  if (changes.resize) {
    nextObject = resizeObject(nextObject, changes.resize.dw, changes.resize.dh);
  }

  return applyStyleChanges(nextObject, changes);
}

function translateObject(object: CanvasObject, dx: number, dy: number): CanvasObject {
  const bounds = translateBounds(object.bounds, dx, dy);

  switch (object.geometry.kind) {
    case 'circle':
      return {
        ...object,
        bounds,
        geometry: {
          ...object.geometry,
          cx: roundNumber(object.geometry.cx + dx),
          cy: roundNumber(object.geometry.cy + dy),
        },
      };
    case 'rectangle':
      return {
        ...object,
        bounds,
        geometry: {
          ...object.geometry,
          x: roundNumber(object.geometry.x + dx),
          y: roundNumber(object.geometry.y + dy),
        },
      };
    case 'triangle':
      return {
        ...object,
        bounds,
        geometry: {
          ...object.geometry,
          points: object.geometry.points.map((point) => translatePoint(point, dx, dy)) as [SvgPoint, SvgPoint, SvgPoint],
        },
      };
    case 'line':
    case 'arrow': {
      const start = translatePoint(object.geometry.start, dx, dy);
      const end = translatePoint(object.geometry.end, dx, dy);

      return {
        ...object,
        bounds: getBoundsForLine({ start, end }),
        geometry: {
          ...object.geometry,
          start,
          end,
        },
      };
    }
    case 'text':
      return {
        ...object,
        bounds,
        geometry: {
          ...object.geometry,
          anchor: translatePoint(object.geometry.anchor, dx, dy),
        },
      };
  }
}

function scaleObject(object: CanvasObject, scale: number): CanvasObject {
  const factor = Math.max(0.1, scale);
  const center = getBoundsCenter(object.bounds);
  const bounds = scaleBounds(object.bounds, factor);

  switch (object.geometry.kind) {
    case 'circle':
      return {
        ...object,
        bounds,
        geometry: {
          ...object.geometry,
          radius: roundNumber(object.geometry.radius * factor),
        },
      };
    case 'rectangle':
      return {
        ...object,
        bounds,
        geometry: {
          ...object.geometry,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        },
      };
    case 'triangle': {
      const points = object.geometry.points.map((point) => scalePoint(point, center, factor)) as [SvgPoint, SvgPoint, SvgPoint];

      return {
        ...object,
        bounds: getBoundsForPoints(points),
        geometry: {
          ...object.geometry,
          points,
        },
      };
    }
    case 'line':
    case 'arrow': {
      const start = scalePoint(object.geometry.start, center, factor);
      const end = scalePoint(object.geometry.end, center, factor);

      return {
        ...object,
        bounds: getBoundsForLine({ start, end }),
        geometry: {
          ...object.geometry,
          start,
          end,
        },
      };
    }
    case 'text':
      return {
        ...object,
        bounds,
        geometry: {
          ...object.geometry,
          fontSize: roundNumber(object.geometry.fontSize * factor),
        },
      };
  }
}

function resizeObject(object: CanvasObject, dw: number, dh: number): CanvasObject {
  switch (object.geometry.kind) {
    case 'line':
    case 'arrow': {
      const directionX = Math.sign(object.geometry.end.x - object.geometry.start.x) || 1;
      const directionY = Math.sign(object.geometry.end.y - object.geometry.start.y) || 1;
      const start = object.geometry.start;
      const end = {
        x: roundNumber(object.geometry.end.x + dw * directionX),
        y: roundNumber(object.geometry.end.y + dh * directionY),
      };

      return {
        ...object,
        bounds: getBoundsForLine({ start, end }),
        geometry: {
          ...object.geometry,
          start,
          end,
        },
      };
    }
    case 'text': {
      const bounds = resizeBounds(object.bounds, dw, dh);
      const widthRatio = object.bounds.width > 0 ? bounds.width / object.bounds.width : 1;
      const heightRatio = object.bounds.height > 0 ? bounds.height / object.bounds.height : 1;
      const scale = Math.max(widthRatio, heightRatio);

      return {
        ...object,
        bounds,
        geometry: {
          ...object.geometry,
          fontSize: roundNumber(object.geometry.fontSize * scale),
        },
      };
    }
    default: {
      const bounds = resizeBounds(object.bounds, dw, dh);

      return {
        ...object,
        bounds,
        geometry: createGeometry(object.type, bounds, object.size),
      };
    }
  }
}

function applyStyleChanges(object: CanvasObject, changes: UpdateDrawingChanges): CanvasObject {
  if (
    typeof changes.strokeWidthDelta !== 'number' &&
    !changes.strokeStyle &&
    typeof changes.fillOpacityDelta !== 'number'
  ) {
    return object;
  }

  const style: CanvasObjectStyle = { ...(object.style ?? {}) };

  if (typeof changes.strokeWidthDelta === 'number') {
    const baseStrokeWidth = style.strokeWidth ?? getDrawingSizeSpec(object.size).strokeWidth;
    style.strokeWidth = roundNumber(clamp(baseStrokeWidth + changes.strokeWidthDelta, MIN_STROKE_WIDTH, MAX_STROKE_WIDTH));
  }

  if (changes.strokeStyle) {
    style.strokeStyle = changes.strokeStyle;
  }

  if (typeof changes.fillOpacityDelta === 'number') {
    const baseFillOpacity = style.fillOpacity ?? DEFAULT_FILL_OPACITY[object.type];
    style.fillOpacity = roundNumber(clamp(baseFillOpacity + changes.fillOpacityDelta, 0, 1));
  }

  return {
    ...object,
    style,
  };
}

function applyLayerChange(
  objects: CanvasObject[],
  targetIndex: number,
  layer?: UpdateDrawingChanges['layer'],
): { objects: CanvasObject[]; targetIndex: number } {
  if (!layer) {
    return { objects, targetIndex };
  }

  const nextObjects = [...objects];
  const [target] = nextObjects.splice(targetIndex, 1);

  if (layer === 'front') {
    nextObjects.push(target);
    return { objects: nextObjects, targetIndex: nextObjects.length - 1 };
  }

  if (layer === 'back') {
    nextObjects.unshift(target);
    return { objects: nextObjects, targetIndex: 0 };
  }

  if (layer === 'forward') {
    const nextIndex = Math.min(nextObjects.length, targetIndex + 1);
    nextObjects.splice(nextIndex, 0, target);
    return { objects: nextObjects, targetIndex: nextIndex };
  }

  const nextIndex = Math.max(0, targetIndex - 1);
  nextObjects.splice(nextIndex, 0, target);
  return { objects: nextObjects, targetIndex: nextIndex };
}

function buildCanvasObject(input: {
  id: string;
  type: DrawingObjectType;
  color: string;
  position: DrawingPosition;
  size: DrawingSize;
  text?: string;
  style?: CanvasObjectStyle;
  customBounds?: SvgBounds;
  customLine?: {
    start: SvgPoint;
    end: SvgPoint;
  };
  state: DrawingState;
}): CanvasObject {
  const bounds =
    input.customBounds ?? getBoundsForLine(input.customLine) ?? getBoundsForPosition(input.position, input.size, input.state.canvas);
  const object: CanvasObject = {
    id: input.id,
    type: input.type,
    color: input.color,
    position: input.position,
    size: input.size,
    bounds,
    geometry: createGeometry(input.type, bounds, input.size, input.customLine),
  };

  if (input.style) {
    object.style = input.style;
  }

  if (input.type === 'text') {
    object.text = input.text ?? DEFAULT_TEXT_VALUE;
  }

  return object;
}

function getBoundsForLine(line: { start: SvgPoint; end: SvgPoint }): SvgBounds;
function getBoundsForLine(line?: { start: SvgPoint; end: SvgPoint }): SvgBounds | null;
function getBoundsForLine(line?: { start: SvgPoint; end: SvgPoint }): SvgBounds | null {
  if (!line) {
    return null;
  }

  const x = Math.min(line.start.x, line.end.x);
  const y = Math.min(line.start.y, line.end.y);

  return {
    x: roundNumber(x),
    y: roundNumber(y),
    width: roundNumber(Math.abs(line.end.x - line.start.x)),
    height: roundNumber(Math.abs(line.end.y - line.start.y)),
  };
}

function createGeometry(
  type: DrawingObjectType,
  bounds: SvgBounds,
  size: DrawingSize,
  customLine?: { start: SvgPoint; end: SvgPoint },
): DrawingGeometry {
  const sizeSpec = getDrawingSizeSpec(size);
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };

  switch (type) {
    case 'circle':
      return {
        kind: 'circle',
        cx: center.x,
        cy: center.y,
        radius: Math.min(bounds.width, bounds.height) / 2,
      };
    case 'rectangle':
      return {
        kind: 'rectangle',
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    case 'triangle':
      return {
        kind: 'triangle',
        points: [
          { x: center.x, y: bounds.y },
          { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
          { x: bounds.x, y: bounds.y + bounds.height },
        ],
      };
    case 'line':
    case 'arrow':
      if (customLine) {
        return {
          kind: type,
          start: customLine.start,
          end: customLine.end,
        };
      }

      return {
        kind: type,
        start: { x: bounds.x, y: center.y },
        end: { x: bounds.x + bounds.width, y: center.y },
      };
    case 'text':
      return {
        kind: 'text',
        anchor: center,
        fontSize: sizeSpec.fontSize,
      };
  }
}

function createObjectId(nextObjectNumber: number): string {
  return `drawing-object-${nextObjectNumber}`;
}

function translatePoint(point: SvgPoint, dx: number, dy: number): SvgPoint {
  return {
    x: roundNumber(point.x + dx),
    y: roundNumber(point.y + dy),
  };
}

function translateBounds(bounds: SvgBounds, dx: number, dy: number): SvgBounds {
  return {
    ...bounds,
    x: roundNumber(bounds.x + dx),
    y: roundNumber(bounds.y + dy),
  };
}

function scalePoint(point: SvgPoint, center: SvgPoint, factor: number): SvgPoint {
  return {
    x: roundNumber(center.x + (point.x - center.x) * factor),
    y: roundNumber(center.y + (point.y - center.y) * factor),
  };
}

function scaleBounds(bounds: SvgBounds, factor: number): SvgBounds {
  const center = getBoundsCenter(bounds);
  const width = Math.max(MIN_OBJECT_SIDE, bounds.width * factor);
  const height = Math.max(MIN_OBJECT_SIDE, bounds.height * factor);

  return {
    x: roundNumber(center.x - width / 2),
    y: roundNumber(center.y - height / 2),
    width: roundNumber(width),
    height: roundNumber(height),
  };
}

function resizeBounds(bounds: SvgBounds, dw: number, dh: number): SvgBounds {
  const center = getBoundsCenter(bounds);
  const width = Math.max(MIN_OBJECT_SIDE, bounds.width + dw);
  const height = Math.max(MIN_OBJECT_SIDE, bounds.height + dh);

  return {
    x: roundNumber(center.x - width / 2),
    y: roundNumber(center.y - height / 2),
    width: roundNumber(width),
    height: roundNumber(height),
  };
}

function getBoundsCenter(bounds: SvgBounds): SvgPoint {
  return {
    x: roundNumber(bounds.x + bounds.width / 2),
    y: roundNumber(bounds.y + bounds.height / 2),
  };
}

function getBoundsForPoints(points: SvgPoint[]): SvgBounds {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);

  return {
    x: roundNumber(x),
    y: roundNumber(y),
    width: roundNumber(Math.max(...xs) - x),
    height: roundNumber(Math.max(...ys) - y),
  };
}

function describeResolvedTarget(object: CanvasObject, targetId?: string, target?: DrawingTargetSelector): string {
  const label = formatObjectType(object.type);

  if (!targetId && !target) {
    return `最近的${label}`;
  }

  if (target?.color && target.objectType) {
    return `${formatColor(target.color)}${label}`;
  }

  if (target?.position && target.objectType) {
    return `${formatPosition(target.position)}${label}`;
  }

  if (target?.textIncludes) {
    return `包含“${target.textIncludes}”的${label}`;
  }

  if (target?.strategy === 'first') {
    return `第一个${label}`;
  }

  if (target?.objectType) {
    return `最近的${label}`;
  }

  return `最近的${label}`;
}

function describeMissingTarget(targetId?: string, target?: DrawingTargetSelector): string {
  if (targetId || target?.id) {
    return '指定对象';
  }

  if (target?.objectType) {
    return formatObjectType(target.objectType);
  }

  if (target?.textIncludes) {
    return '文字';
  }

  return '对象';
}

function describeUpdateChange(changes: UpdateDrawingChanges, object: CanvasObject): string {
  if (changes.translate) {
    return describeTranslate(changes.translate.dx, changes.translate.dy);
  }

  if (typeof changes.scale === 'number') {
    if (object.type === 'text') {
      return changes.scale >= 1 ? '调大一点' : '调小一点';
    }

    return changes.scale >= 1 ? '放大一点' : '缩小一点';
  }

  if (changes.resize) {
    return describeResize(changes.resize.dw, changes.resize.dh);
  }

  if (changes.color) {
    return `改成${formatColor(changes.color)}`;
  }

  if (typeof changes.text === 'string') {
    return `改成${changes.text}`;
  }

  if (changes.strokeStyle) {
    return changes.strokeStyle === 'dashed' ? '改成虚线' : '改成实线';
  }

  if (typeof changes.strokeWidthDelta === 'number') {
    return changes.strokeWidthDelta >= 0 ? '描边加粗一点' : '描边变细一点';
  }

  if (typeof changes.fillOpacityDelta === 'number') {
    return changes.fillOpacityDelta >= 0 ? '填充加深一点' : '填充变淡一点';
  }

  if (changes.layer) {
    const labels: Record<NonNullable<UpdateDrawingChanges['layer']>, string> = {
      front: '置顶',
      back: '置底',
      forward: '上移一层',
      backward: '下移一层',
    };

    return labels[changes.layer];
  }

  if (changes.size) {
    if (object.type === 'text') {
      return changes.size === 'small' ? '调小一点' : '调大一点';
    }

    return changes.size === 'small' ? '缩小一点' : '放大一点';
  }

  if (changes.position) {
    return `移到${formatPosition(changes.position)}`;
  }

  return '更新';
}

function describeTranslate(dx: number, dy: number): string {
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
    return dx > 0 ? '右移一点' : '左移一点';
  }

  if (dy !== 0) {
    return dy > 0 ? '下移一点' : '上移一点';
  }

  return `移动${DEFAULT_TRANSLATE_STEP}像素`;
}

function describeResize(dw: number, dh: number): string {
  if (Math.abs(dw) >= Math.abs(dh) && dw !== 0) {
    return dw > 0 ? '变宽一点' : '变窄一点';
  }

  if (dh !== 0) {
    return dh > 0 ? '变高一点' : '变矮一点';
  }

  return '调整尺寸';
}

function formatObjectType(objectType: DrawingObjectType): string {
  const labels: Record<DrawingObjectType, string> = {
    circle: '圆形',
    rectangle: '矩形',
    triangle: '三角形',
    line: '直线',
    arrow: '箭头',
    text: '文字',
  };

  return labels[objectType];
}

function formatColor(color: string): string {
  const labels: Record<string, string> = {
    '#ef4444': '红色',
    '#2563eb': '蓝色',
    '#16a34a': '绿色',
    '#d97706': '黄色',
    '#111827': '黑色',
    '#ffffff': '白色',
    '#7c3aed': '紫色',
    '#f97316': '橙色',
  };

  return labels[color] ?? color;
}

function formatPosition(position: DrawingPosition): string {
  const labels: Record<DrawingPosition, string> = {
    center: '中间',
    'top-left': '左上角',
    'top-right': '右上角',
    'bottom-left': '左下角',
    'bottom-right': '右下角',
    left: '左侧',
    right: '右侧',
    top: '上方',
    bottom: '下方',
  };

  return labels[position];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}
