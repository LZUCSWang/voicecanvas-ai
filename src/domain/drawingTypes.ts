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

export const DRAWING_TARGET_STRATEGIES = ['latest', 'first', 'last'] as const;
export type DrawingTargetStrategy = (typeof DRAWING_TARGET_STRATEGIES)[number];

export const DRAWING_STROKE_STYLES = ['solid', 'dashed'] as const;
export type DrawingStrokeStyle = (typeof DRAWING_STROKE_STYLES)[number];

export const DRAWING_LAYER_CHANGES = ['front', 'back', 'forward', 'backward'] as const;
export type DrawingLayerChange = (typeof DRAWING_LAYER_CHANGES)[number];

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

export interface CanvasObjectStyle {
  strokeWidth?: number;
  strokeStyle?: DrawingStrokeStyle;
  fillOpacity?: number;
  cornerRadius?: number;
  cornerRadiusX?: number;
  cornerRadiusY?: number;
  arrowHeadSize?: number;
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
  dashArray?: string;
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
      rx?: number;
      ry?: number;
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
      kind: 'polyline';
      points: SvgPoint[];
    }
  | {
      kind: 'curve';
      start: SvgPoint;
      control1: SvgPoint;
      control2: SvgPoint;
      end: SvgPoint;
    }
  | {
      kind: 'text';
      anchor: SvgPoint;
      fontSize: number;
    };

export type FreeformDrawingGeometry =
  | Extract<DrawingGeometry, { kind: 'circle' | 'rectangle' | 'polyline' | 'curve' }>
  | {
      kind: 'line' | 'arrow';
      start: SvgPoint;
      end: SvgPoint;
    };

export interface CanvasObject {
  id: string;
  type: DrawingObjectType;
  color: string;
  position: DrawingPosition;
  size: DrawingSize;
  bounds: SvgBounds;
  geometry: DrawingGeometry;
  style?: CanvasObjectStyle;
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
  style?: CanvasObjectStyle;
  customBounds?: SvgBounds;
  customLine?: {
    start: SvgPoint;
    end: SvgPoint;
  };
  customGeometry?: FreeformDrawingGeometry;
}

export interface DrawingTargetSelector {
  id?: string;
  objectType?: DrawingObjectType;
  color?: string;
  position?: DrawingPosition;
  textIncludes?: string;
  strategy?: DrawingTargetStrategy;
}

export interface UpdateDrawingChanges {
  color?: string;
  position?: DrawingPosition;
  size?: DrawingSize;
  text?: string;
  translate?: {
    dx: number;
    dy: number;
  };
  scale?: number;
  resize?: {
    dw: number;
    dh: number;
  };
  strokeWidthDelta?: number;
  strokeStyle?: DrawingStrokeStyle;
  fillOpacityDelta?: number;
  style?: CanvasObjectStyle;
  geometry?: FreeformDrawingGeometry;
  layer?: DrawingLayerChange;
}

export interface UpdateDrawingAction {
  type: 'update';
  targetId?: string;
  target?: DrawingTargetSelector;
  changes: UpdateDrawingChanges;
}

export interface DeleteDrawingAction {
  type: 'delete';
  targetId?: string;
  target?: DrawingTargetSelector;
}

export interface ClearDrawingAction {
  type: 'clear';
}

export type DrawAction = CreateDrawingAction | UpdateDrawingAction | DeleteDrawingAction | ClearDrawingAction;
