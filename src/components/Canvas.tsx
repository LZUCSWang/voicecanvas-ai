import { getDrawingSizeSpec } from '../domain/drawingState';
import type { CanvasObject, DrawingGeometry, DrawingObjectType, DrawingState, SvgPoint } from '../domain/drawingTypes';
import type { Ref } from 'react';

interface CanvasProps {
  state: DrawingState;
  svgRef?: Ref<SVGSVGElement>;
}

export function Canvas({ state, svgRef }: CanvasProps) {
  return (
    <div className="canvas-frame">
      <svg
        ref={svgRef}
        className="drawing-canvas"
        role="img"
        aria-label="VoiceCanvas drawing canvas"
        viewBox={`0 0 ${state.canvas.width} ${state.canvas.height}`}
      >
        <defs>
          <pattern id="canvas-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 H 0 V 40" className="canvas-grid-line" />
          </pattern>
          {state.objects.filter((object) => object.type === 'arrow').map((object) => renderArrowMarker(object))}
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
  const strokeWidth = object.style?.strokeWidth ?? getDrawingSizeSpec(object.size).strokeWidth;
  const strokeDasharray = object.style?.dashArray ?? (object.style?.strokeStyle === 'dashed' ? '10 8' : undefined);
  const strokeLinecap = object.style?.lineCap ?? 'round';
  const strokeLinejoin = object.style?.lineJoin;
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
          fillOpacity={getFillOpacity(object)}
          stroke={object.color}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
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
          rx={getRectangleRadiusX(object)}
          ry={getRectangleRadiusY(object)}
          fill={object.color}
          fillOpacity={getFillOpacity(object)}
          stroke={object.color}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
        />
      );
    case 'triangle':
      return (
        <polygon
          key={object.id}
          {...commonProps}
          points={formatPoints(object.geometry.points)}
          fill={object.color}
          fillOpacity={getFillOpacity(object)}
          stroke={object.color}
          strokeLinejoin={strokeLinejoin ?? 'round'}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
        />
      );
    case 'line':
      return renderLineObject(object.id, commonProps, object.geometry, object.color, strokeWidth, strokeDasharray, strokeLinecap, strokeLinejoin, false);
    case 'arrow':
      return renderLineObject(object.id, commonProps, object.geometry, object.color, strokeWidth, strokeDasharray, strokeLinecap, strokeLinejoin, true);
    case 'polyline':
    case 'curve':
      return renderLineObject(
        object.id,
        commonProps,
        object.geometry,
        object.color,
        strokeWidth,
        strokeDasharray,
        strokeLinecap,
        strokeLinejoin,
        object.type === 'arrow',
      );
    case 'text':
      const fontSize = getFittedTextFontSize(object);
      return (
        <text
          key={object.id}
          {...commonProps}
          x={object.geometry.anchor.x}
          y={object.geometry.anchor.y}
          fill={object.color}
          fontSize={fontSize}
          fontWeight="700"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {object.text}
        </text>
      );
  }
}

function renderArrowMarker(object: CanvasObject) {
  const size = object.style?.arrowHeadSize ?? 10;

  return (
    <marker
      key={`marker-${object.id}`}
      id={getArrowMarkerId(object.id)}
      markerWidth={size}
      markerHeight={size}
      refX={size * 0.9}
      refY={size / 2}
      orient="auto"
      markerUnits="userSpaceOnUse"
    >
      <path d={`M 0 0 L ${size} ${size / 2} L 0 ${size} z`} fill="context-stroke" />
    </marker>
  );
}

function getArrowMarkerId(objectId: string): string {
  return `arrow-head-${objectId}`;
}

function getRectangleRadiusX(object: CanvasObject): number {
  if (object.geometry.kind !== 'rectangle') {
    return 6;
  }

  return object.style?.cornerRadiusX ?? object.style?.cornerRadius ?? object.geometry.rx ?? 6;
}

function getRectangleRadiusY(object: CanvasObject): number {
  if (object.geometry.kind !== 'rectangle') {
    return 6;
  }

  return object.style?.cornerRadiusY ?? object.style?.cornerRadius ?? object.geometry.ry ?? object.geometry.rx ?? 6;
}

function getFittedTextFontSize(object: CanvasObject): number {
  if (object.geometry.kind !== 'text') {
    return getDrawingSizeSpec(object.size).fontSize;
  }

  const textLength = object.text?.length ?? 0;

  if (textLength === 0) {
    return object.geometry.fontSize;
  }

  const horizontalFit = Math.floor((object.bounds.width * 1.55) / textLength);
  const verticalFit = Math.floor(object.bounds.height * 0.72);
  const fitted = Math.min(object.geometry.fontSize, horizontalFit, verticalFit);

  return Math.max(12, Math.round(fitted));
}

function renderLineObject(
  key: string,
  commonProps: Record<string, string>,
  geometry: Extract<DrawingGeometry, { kind: 'line' | 'arrow' | 'polyline' | 'curve' }>,
  color: string,
  strokeWidth: number,
  strokeDasharray: string | undefined,
  strokeLinecap: CanvasObject['style'] extends infer Style ? Style extends { lineCap?: infer LineCap } ? LineCap : never : never,
  strokeLinejoin: CanvasObject['style'] extends infer Style ? Style extends { lineJoin?: infer LineJoin } ? LineJoin | undefined : never : never,
  hasArrowHead: boolean,
) {
  if (geometry.kind === 'polyline' || geometry.kind === 'curve') {
    return (
      <path
        key={key}
        {...commonProps}
        d={formatPathGeometry(geometry)}
        fill="none"
        stroke={color}
        strokeLinecap={strokeLinecap}
        strokeLinejoin={strokeLinejoin}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        markerEnd={hasArrowHead ? `url(#${getArrowMarkerId(key)})` : undefined}
      />
    );
  }

  return (
    <line
      key={key}
      {...commonProps}
      x1={geometry.start.x}
      y1={geometry.start.y}
      x2={geometry.end.x}
      y2={geometry.end.y}
      stroke={color}
      strokeLinecap={strokeLinecap}
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDasharray}
      markerEnd={hasArrowHead ? `url(#${getArrowMarkerId(key)})` : undefined}
    />
  );
}

function formatPathGeometry(geometry: Extract<DrawingGeometry, { kind: 'polyline' | 'curve' }>): string {
  if (geometry.kind === 'curve') {
    return `M ${geometry.start.x} ${geometry.start.y} C ${geometry.control1.x} ${geometry.control1.y}, ${geometry.control2.x} ${geometry.control2.y}, ${geometry.end.x} ${geometry.end.y}`;
  }

  const [firstPoint, ...remainingPoints] = geometry.points;

  return [`M ${firstPoint.x} ${firstPoint.y}`, ...remainingPoints.map((point) => `L ${point.x} ${point.y}`)].join(' ');
}

function getFillOpacity(object: CanvasObject): number {
  if (typeof object.style?.fillOpacity === 'number') {
    return object.style.fillOpacity;
  }

  const defaults: Record<DrawingObjectType, number> = {
    circle: 0.16,
    rectangle: 0.14,
    triangle: 0.14,
    line: 0,
    arrow: 0,
    text: 1,
  };

  return defaults[object.type];
}

function formatPoints(points: [SvgPoint, SvgPoint, SvgPoint]) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}
