import { getBoundsForPosition, getDrawingSizeSpec } from './drawingState';
import type {
  CanvasObject,
  CreateDrawingAction,
  DrawAction,
  DrawingGeometry,
  DrawingObjectType,
  DrawingPosition,
  DrawingSize,
  DrawingState,
  SvgBounds,
} from './drawingTypes';

const DEFAULT_OBJECT_COLOR = '#111827';
const DEFAULT_OBJECT_POSITION: DrawingPosition = 'center';
const DEFAULT_OBJECT_SIZE: DrawingSize = 'medium';
const DEFAULT_TEXT_VALUE = 'Text';

export function executeDrawingAction(state: DrawingState, action: DrawAction): DrawingState {
  switch (action.type) {
    case 'create':
      return createObject(state, action);
    case 'update':
      return updateObject(state, action.targetId, action.changes);
    case 'delete':
      return deleteObject(state, action.targetId);
    case 'clear':
      return {
        ...state,
        objects: [],
        nextObjectNumber: 1,
      };
  }
}

function createObject(state: DrawingState, action: CreateDrawingAction): DrawingState {
  const object = buildCanvasObject({
    id: createObjectId(state.nextObjectNumber),
    type: action.objectType,
    color: action.color ?? DEFAULT_OBJECT_COLOR,
    position: action.position ?? DEFAULT_OBJECT_POSITION,
    size: action.size ?? DEFAULT_OBJECT_SIZE,
    text: action.text,
    state,
  });

  return {
    ...state,
    objects: [...state.objects, object],
    nextObjectNumber: state.nextObjectNumber + 1,
  };
}

function updateObject(
  state: DrawingState,
  targetId: string | undefined,
  changes: {
    color?: string;
    position?: DrawingPosition;
    size?: DrawingSize;
    text?: string;
  },
): DrawingState {
  const targetIndex = findTargetObjectIndex(state.objects, targetId);

  if (targetIndex < 0) {
    return state;
  }

  const currentObject = state.objects[targetIndex];
  const nextObject = buildCanvasObject({
    id: currentObject.id,
    type: currentObject.type,
    color: changes.color ?? currentObject.color,
    position: changes.position ?? currentObject.position,
    size: changes.size ?? currentObject.size,
    text: currentObject.type === 'text' ? changes.text ?? currentObject.text : undefined,
    state,
  });

  return {
    ...state,
    objects: state.objects.map((object, index) => (index === targetIndex ? nextObject : object)),
  };
}

function deleteObject(state: DrawingState, targetId?: string): DrawingState {
  const targetIndex = findTargetObjectIndex(state.objects, targetId);

  if (targetIndex < 0) {
    return state;
  }

  return {
    ...state,
    objects: state.objects.filter((_, index) => index !== targetIndex),
  };
}

function findTargetObjectIndex(objects: CanvasObject[], targetId?: string): number {
  if (targetId) {
    return objects.findIndex((object) => object.id === targetId);
  }

  return objects.length - 1;
}

function buildCanvasObject(input: {
  id: string;
  type: DrawingObjectType;
  color: string;
  position: DrawingPosition;
  size: DrawingSize;
  text?: string;
  state: DrawingState;
}): CanvasObject {
  const bounds = getBoundsForPosition(input.position, input.size, input.state.canvas);
  const object: CanvasObject = {
    id: input.id,
    type: input.type,
    color: input.color,
    position: input.position,
    size: input.size,
    bounds,
    geometry: createGeometry(input.type, bounds, input.size),
  };

  if (input.type === 'text') {
    object.text = input.text ?? DEFAULT_TEXT_VALUE;
  }

  return object;
}

function createGeometry(type: DrawingObjectType, bounds: SvgBounds, size: DrawingSize): DrawingGeometry {
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
