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
      const textLines = getFittedTextLines(object, fontSize);
      const lineHeight = Math.round(fontSize * 1.18);
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
          {textLines.length === 1
            ? object.text
            : textLines.map((line, index) => (
              <tspan
                key={`${object.id}-line-${index}`}
                x={object.geometry.kind === 'text' ? object.geometry.anchor.x : 0}
                dy={index === 0 ? -((textLines.length - 1) * lineHeight) / 2 : lineHeight}
              >
                {line}
              </tspan>
            ))}
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

  const text = object.text ?? '';
  const textWeight = getTextFitWeight(text);

  if (textWeight === 0) {
    return object.geometry.fontSize;
  }

  const horizontalSafety = hasWideGlyph(text) ? 0.92 : 0.86;
  const horizontalFit = Math.floor((object.bounds.width * horizontalSafety) / textWeight);
  const verticalFit = Math.floor(object.bounds.height * 0.72);
  const fitted = Math.min(object.geometry.fontSize, horizontalFit, verticalFit);

  return Math.max(12, Math.round(fitted));
}

function getTextFitWeight(text: string): number {
  return Array.from(text).reduce((weight, character) => weight + getCharacterFitWeight(character), 0);
}

function getFittedTextLines(object: CanvasObject, fontSize: number): string[] {
  const text = object.text ?? '';
  const textWeight = getTextFitWeight(text);

  if (fontSize > 12 || textWeight === 0) {
    return [text];
  }

  const horizontalSafety = hasWideGlyph(text) ? 0.92 : 0.86;
  const maxLineWeight = (object.bounds.width * horizontalSafety) / fontSize;

  if (textWeight <= maxLineWeight) {
    return [text];
  }

  const maxLines = Math.max(1, Math.floor(object.bounds.height / (fontSize * 1.18)));

  return wrapTextByWeight(text, maxLineWeight, maxLines);
}

function wrapTextByWeight(text: string, maxLineWeight: number, maxLines: number): string[] {
  const lines: string[] = [];
  let currentLine = '';
  let currentWeight = 0;

  for (const token of getTextWrapTokens(text)) {
    const tokenWeight = getTextFitWeight(token);

    if (currentLine && currentWeight + tokenWeight > maxLineWeight) {
      lines.push(currentLine.trim());
      currentLine = token.trimStart();
      currentWeight = getTextFitWeight(currentLine);
      continue;
    }

    currentLine += token;
    currentWeight += tokenWeight;
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const visibleLines = lines.slice(0, maxLines);
  visibleLines[maxLines - 1] = trimTextToWeight(
    `${visibleLines[maxLines - 1]}${lines.slice(maxLines).join('')}`,
    maxLineWeight,
  );

  return visibleLines;
}

function getTextWrapTokens(text: string): string[] {
  return text.match(/[A-Za-z0-9]+|\s+|./gu) ?? [];
}

function trimTextToWeight(text: string, maxWeight: number): string {
  const suffix = '...';
  const suffixWeight = getTextFitWeight(suffix);
  let result = '';
  let weight = 0;

  for (const character of Array.from(text)) {
    const characterWeight = getCharacterFitWeight(character);

    if (weight + characterWeight + suffixWeight > maxWeight) {
      return `${result.trimEnd()}${suffix}`;
    }

    result += character;
    weight += characterWeight;
  }

  return result;
}

function getCharacterFitWeight(character: string): number {
  if (/\s/.test(character)) {
    return 0.35;
  }

  if (isWideGlyph(character)) {
    return 1;
  }

  if (/[A-Z0-9]/.test(character)) {
    return 0.65;
  }

  if (/[a-z]/.test(character)) {
    return 0.58;
  }

  return 0.35;
}

function hasWideGlyph(text: string): boolean {
  return Array.from(text).some(isWideGlyph);
}

function isWideGlyph(character: string): boolean {
  return /[\u3000-\u9fff]/.test(character);
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
