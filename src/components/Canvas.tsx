import { getDrawingSizeSpec } from '../domain/drawingState';
import type { CanvasObject, DrawingGeometry, DrawingState, SvgPoint } from '../domain/drawingTypes';

interface CanvasProps {
  state: DrawingState;
}

export function Canvas({ state }: CanvasProps) {
  return (
    <div className="canvas-frame">
      <svg
        className="drawing-canvas"
        role="img"
        aria-label="VoiceCanvas drawing canvas"
        viewBox={`0 0 ${state.canvas.width} ${state.canvas.height}`}
      >
        <defs>
          <pattern id="canvas-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 H 0 V 40" className="canvas-grid-line" />
          </pattern>
          <marker
            id="arrow-head"
            markerWidth="12"
            markerHeight="12"
            refX="10"
            refY="6"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 12 6 L 0 12 z" fill="context-stroke" />
          </marker>
        </defs>

        <rect className="canvas-background" width={state.canvas.width} height={state.canvas.height} />
        <rect className="canvas-grid" width={state.canvas.width} height={state.canvas.height} fill="url(#canvas-grid)" />

        {state.objects.map((object) => renderCanvasObject(object))}

        {state.objects.length === 0 ? (
          <text className="canvas-empty-hint" x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
            等待绘图动作
          </text>
        ) : null}
      </svg>
    </div>
  );
}

function renderCanvasObject(object: CanvasObject) {
  const strokeWidth = getDrawingSizeSpec(object.size).strokeWidth;
  const commonProps = {
    'data-object-id': object.id,
    'data-object-type': object.type,
  };

  switch (object.geometry.kind) {
    case 'circle':
      return (
        <circle
          key={object.id}
          {...commonProps}
          cx={object.geometry.cx}
          cy={object.geometry.cy}
          r={object.geometry.radius}
          fill={object.color}
          fillOpacity="0.16"
          stroke={object.color}
          strokeWidth={strokeWidth}
        />
      );
    case 'rectangle':
      return (
        <rect
          key={object.id}
          {...commonProps}
          x={object.geometry.x}
          y={object.geometry.y}
          width={object.geometry.width}
          height={object.geometry.height}
          rx="6"
          fill={object.color}
          fillOpacity="0.14"
          stroke={object.color}
          strokeWidth={strokeWidth}
        />
      );
    case 'triangle':
      return (
        <polygon
          key={object.id}
          {...commonProps}
          points={formatPoints(object.geometry.points)}
          fill={object.color}
          fillOpacity="0.14"
          stroke={object.color}
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
        />
      );
    case 'line':
      return renderLineObject(object.id, commonProps, object.geometry, object.color, strokeWidth, false);
    case 'arrow':
      return renderLineObject(object.id, commonProps, object.geometry, object.color, strokeWidth, true);
    case 'text':
      return (
        <text
          key={object.id}
          {...commonProps}
          x={object.geometry.anchor.x}
          y={object.geometry.anchor.y}
          fill={object.color}
          fontSize={object.geometry.fontSize}
          fontWeight="700"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {object.text}
        </text>
      );
  }
}

function renderLineObject(
  key: string,
  commonProps: Record<string, string>,
  geometry: Extract<DrawingGeometry, { kind: 'line' | 'arrow' }>,
  color: string,
  strokeWidth: number,
  hasArrowHead: boolean,
) {
  return (
    <line
      key={key}
      {...commonProps}
      x1={geometry.start.x}
      y1={geometry.start.y}
      x2={geometry.end.x}
      y2={geometry.end.y}
      stroke={color}
      strokeLinecap="round"
      strokeWidth={strokeWidth}
      markerEnd={hasArrowHead ? 'url(#arrow-head)' : undefined}
    />
  );
}

function formatPoints(points: [SvgPoint, SvgPoint, SvgPoint]) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}
