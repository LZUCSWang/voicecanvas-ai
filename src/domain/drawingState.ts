import type { DrawingCanvas, DrawingPosition, DrawingSize, DrawingSizeSpec, DrawingState, SvgBounds } from './drawingTypes';

export const DEFAULT_DRAWING_CANVAS: DrawingCanvas = {
  width: 800,
  height: 500,
  margin: 40,
};

export const DRAWING_SIZE_SPECS: Record<DrawingSize, DrawingSizeSpec> = {
  small: {
    width: 80,
    height: 60,
    strokeWidth: 3,
    fontSize: 24,
  },
  medium: {
    width: 140,
    height: 100,
    strokeWidth: 4,
    fontSize: 36,
  },
  large: {
    width: 220,
    height: 160,
    strokeWidth: 6,
    fontSize: 52,
  },
};

export function createInitialDrawingState(canvas: DrawingCanvas = DEFAULT_DRAWING_CANVAS): DrawingState {
  return {
    canvas,
    objects: [],
    nextObjectNumber: 1,
  };
}

export function getDrawingSizeSpec(size: DrawingSize): DrawingSizeSpec {
  return DRAWING_SIZE_SPECS[size];
}

export function getBoundsForPosition(position: DrawingPosition, size: DrawingSize, canvas: DrawingCanvas): SvgBounds {
  const sizeSpec = getDrawingSizeSpec(size);
  const centeredX = Math.round((canvas.width - sizeSpec.width) / 2);
  const centeredY = Math.round((canvas.height - sizeSpec.height) / 2);
  const leftX = canvas.margin;
  const rightX = canvas.width - canvas.margin - sizeSpec.width;
  const topY = canvas.margin;
  const bottomY = canvas.height - canvas.margin - sizeSpec.height;

  const coordinates: Record<DrawingPosition, Pick<SvgBounds, 'x' | 'y'>> = {
    center: { x: centeredX, y: centeredY },
    'top-left': { x: leftX, y: topY },
    'top-right': { x: rightX, y: topY },
    'bottom-left': { x: leftX, y: bottomY },
    'bottom-right': { x: rightX, y: bottomY },
    left: { x: leftX, y: centeredY },
    right: { x: rightX, y: centeredY },
    top: { x: centeredX, y: topY },
    bottom: { x: centeredX, y: bottomY },
  };

  return {
    ...coordinates[position],
    width: sizeSpec.width,
    height: sizeSpec.height,
  };
}
