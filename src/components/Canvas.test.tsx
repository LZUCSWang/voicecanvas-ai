import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { executeDrawingAction } from '../domain/drawingExecutor';
import { createInitialDrawingState } from '../domain/drawingState';
import type { DrawAction } from '../domain/drawingTypes';
import { Canvas } from './Canvas';

function createStateWithEveryObject() {
  const actions: DrawAction[] = [
    { type: 'create', objectType: 'circle', color: '#ef4444', position: 'top-left', size: 'small' },
    { type: 'create', objectType: 'rectangle', color: '#2563eb', position: 'top-right', size: 'medium' },
    { type: 'create', objectType: 'triangle', color: '#16a34a', position: 'bottom-left', size: 'medium' },
    { type: 'create', objectType: 'line', color: '#f59e0b', position: 'bottom', size: 'small' },
    { type: 'create', objectType: 'arrow', color: '#7c3aed', position: 'right', size: 'medium' },
    {
      type: 'create',
      objectType: 'text',
      color: '#111827',
      position: 'center',
      size: 'small',
      text: 'Demo text',
    },
  ];

  return actions.reduce(executeDrawingAction, createInitialDrawingState());
}

describe('Canvas', () => {
  it('renders every supported drawing object as SVG output', () => {
    const markup = renderToStaticMarkup(<Canvas state={createStateWithEveryObject()} />);

    expect(markup).toContain('aria-label="VoiceCanvas drawing canvas"');
    expect(markup).toContain('<circle');
    expect(markup).toContain('<rect');
    expect(markup).toContain('<polygon');
    expect(markup).toContain('data-object-type="line"');
    expect(markup).toContain('marker-end="url(#arrow-head-');
    expect(markup).toContain('>Demo text</text>');
  });

  it('shows a useful empty canvas hint before any drawing action exists', () => {
    const markup = renderToStaticMarkup(<Canvas state={createInitialDrawingState()} />);

    expect(markup).toContain('等待绘图动作');
  });

  it('renders optional object style while keeping legacy defaults for old objects', () => {
    const actions: DrawAction[] = [
      {
        type: 'create',
        objectType: 'rectangle',
        color: '#2563eb',
        position: 'center',
        size: 'medium',
      },
      {
        type: 'update',
        target: { objectType: 'rectangle' },
        changes: {
          strokeStyle: 'dashed',
          strokeWidthDelta: 2,
          fillOpacityDelta: -0.04,
        },
      },
      {
        type: 'create',
        objectType: 'circle',
        color: '#ef4444',
        position: 'left',
        size: 'small',
      },
    ];
    const state = actions.reduce(executeDrawingAction, createInitialDrawingState());

    const markup = renderToStaticMarkup(<Canvas state={state} />);

    expect(markup).toContain('stroke-dasharray="10 8"');
    expect(markup).toContain('stroke-width="6"');
    expect(markup).toContain('fill-opacity="0.1"');
    expect(markup).toContain('fill-opacity="0.16"');
  });

  it('shrinks long text to fit inside its drawing bounds', () => {
    const state = [
      {
        type: 'create',
        objectType: 'text',
        text: 'Multi-Head Self-Attention',
        color: '#111827',
        position: 'center',
        size: 'small',
        customBounds: { x: 268, y: 202, width: 264, height: 42 },
      } satisfies DrawAction,
      {
        type: 'update',
        target: { objectType: 'text' },
        changes: { scale: 1.2 },
      } satisfies DrawAction,
    ].reduce(executeDrawingAction, createInitialDrawingState());

    const markup = renderToStaticMarkup(<Canvas state={state} />);

    expect(markup).toContain('>Multi-Head Self-Attention</text>');
    expect(markup).toContain('font-size="19"');
  });

  it('shrinks compact Chinese labels so they stay inside flowchart nodes', () => {
    const state = [
      {
        type: 'create',
        objectType: 'text',
        text: '输入用户名密码',
        color: '#111827',
        position: 'center',
        size: 'small',
        customBounds: { x: 70, y: 166, width: 130, height: 38 },
      } satisfies DrawAction,
    ].reduce(executeDrawingAction, createInitialDrawingState());

    const markup = renderToStaticMarkup(<Canvas state={state} />);

    expect(markup).toContain('>输入用户名密码</text>');
    expect(markup).toContain('font-size="17"');
  });

  it('wraps very long Chinese labels when minimum font size still cannot fit one line', () => {
    const state = [
      {
        type: 'create',
        objectType: 'text',
        text: '本地兜底：离线可用、规则驱动、响应快、数据安全',
        color: '#111827',
        position: 'center',
        size: 'small',
        customBounds: { x: 102, y: 170, width: 226, height: 52 },
      } satisfies DrawAction,
    ].reduce(executeDrawingAction, createInitialDrawingState());

    const markup = renderToStaticMarkup(<Canvas state={state} />);

    expect(markup).toContain('font-size="12"');
    expect(markup).toContain('<tspan');
  });

  it('keeps Latin words intact when wrapping mixed Chinese and English labels', () => {
    const state = [
      {
        type: 'create',
        objectType: 'text',
        text: '本地兜底：依赖本地缓存/规则引擎做fallback，响应快但灵活性低',
        color: '#111827',
        position: 'center',
        size: 'small',
        customBounds: { x: 102, y: 170, width: 226, height: 52 },
      } satisfies DrawAction,
    ].reduce(executeDrawingAction, createInitialDrawingState());

    const markup = renderToStaticMarkup(<Canvas state={state} />);

    expect(markup).toContain('<tspan');
    expect(markup).toContain('fallback');
  });

  it('keeps arrow heads visually stable when AI makes connector lines thicker', () => {
    const state = [
      {
        type: 'create',
        objectType: 'arrow',
        color: '#e11d48',
        position: 'center',
        size: 'medium',
        customLine: {
          start: { x: 400, y: 150 },
          end: { x: 400, y: 230 },
        },
      } satisfies DrawAction,
      {
        type: 'update',
        target: { objectType: 'arrow' },
        changes: { strokeWidthDelta: 8 },
      } satisfies DrawAction,
    ].reduce(executeDrawingAction, createInitialDrawingState());

    const markup = renderToStaticMarkup(<Canvas state={state} />);

    expect(markup).toContain('markerUnits="userSpaceOnUse"');
    expect(markup).toContain('markerWidth="10"');
    expect(markup).toContain('markerHeight="10"');
    expect(markup).toContain('stroke-width="12"');
  });

  it('renders AI-controlled rounded rectangles, polylines, curves, and arrow head sizes', () => {
    const actions = [
      {
        type: 'create',
        objectType: 'rectangle',
        color: '#7c3aed',
        customGeometry: { kind: 'rectangle', x: 120, y: 80, width: 180, height: 72, rx: 22, ry: 14 },
        style: { fillOpacity: 0.24, strokeWidth: 5 },
      },
      {
        type: 'create',
        objectType: 'arrow',
        color: '#e11d48',
        customGeometry: {
          kind: 'polyline',
          points: [
            { x: 310, y: 116 },
            { x: 370, y: 116 },
            { x: 370, y: 190 },
            { x: 480, y: 190 },
          ],
        },
        style: { arrowHeadSize: 16, strokeWidth: 4, lineJoin: 'round' },
      },
      {
        type: 'create',
        objectType: 'line',
        color: '#0f766e',
        customGeometry: {
          kind: 'curve',
          start: { x: 100, y: 270 },
          control1: { x: 190, y: 210 },
          control2: { x: 310, y: 330 },
          end: { x: 430, y: 270 },
        },
      },
    ] satisfies DrawAction[];
    const state = actions.reduce(executeDrawingAction, createInitialDrawingState());

    const markup = renderToStaticMarkup(<Canvas state={state} />);

    expect(markup).toContain('rx="22"');
    expect(markup).toContain('ry="14"');
    expect(markup).toContain('fill-opacity="0.24"');
    expect(markup).toContain('markerWidth="16"');
    expect(markup).toContain('d="M 310 116 L 370 116 L 370 190 L 480 190"');
    expect(markup).toContain('stroke-linejoin="round"');
    expect(markup).toContain('d="M 100 270 C 190 210, 310 330, 430 270"');
  });
});
