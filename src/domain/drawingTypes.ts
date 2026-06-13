export const DRAWING_OBJECT_TYPES = ['circle', 'rectangle', 'triangle', 'line', 'arrow', 'text'] as const;
export type DrawingObjectType = (typeof DRAWING_OBJECT_TYPES)[number];

export const DRAWING_POSITIONS = [
  'center',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'left',
  'right',
  'top',
  'bottom',
] as const;
export type DrawingPosition = (typeof DRAWING_POSITIONS)[number];

export const DRAWING_SIZES = ['small', 'medium', 'large'] as const;
export type DrawingSize = (typeof DRAWING_SIZES)[number];

export interface DrawingCanvas {
  width: number;
  height: number;
  margin: number;
}

export interface SvgPoint {
  x: number;
  y: number;
}

export interface SvgBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DrawingSizeSpec {
  width: number;
  height: number;
  strokeWidth: number;
  fontSize: number;
}

export type DrawingGeometry =
  | {
      kind: 'circle';
      cx: number;
      cy: number;
      radius: number;
    }
  | {
      kind: 'rectangle';
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      kind: 'triangle';
      points: [SvgPoint, SvgPoint, SvgPoint];
    }
  | {
      kind: 'line' | 'arrow';
      start: SvgPoint;
      end: SvgPoint;
    }
  | {
      kind: 'text';
      anchor: SvgPoint;
      fontSize: number;
    };

export interface CanvasObject {
  id: string;
  type: DrawingObjectType;
  color: string;
  position: DrawingPosition;
  size: DrawingSize;
  bounds: SvgBounds;
  geometry: DrawingGeometry;
  text?: string;
}

export interface DrawingState {
  canvas: DrawingCanvas;
  objects: CanvasObject[];
  nextObjectNumber: number;
}

export interface CreateDrawingAction {
  type: 'create';
  objectType: DrawingObjectType;
  color?: string;
  position?: DrawingPosition;
  size?: DrawingSize;
  text?: string;
  customBounds?: SvgBounds;
  customLine?: {
    start: SvgPoint;
    end: SvgPoint;
  };
}

export interface UpdateDrawingAction {
  type: 'update';
  targetId?: string;
  changes: {
    color?: string;
    position?: DrawingPosition;
    size?: DrawingSize;
    text?: string;
  };
}

export interface DeleteDrawingAction {
  type: 'delete';
  targetId?: string;
}

export interface ClearDrawingAction {
  type: 'clear';
}

export type DrawAction = CreateDrawingAction | UpdateDrawingAction | DeleteDrawingAction | ClearDrawingAction;
