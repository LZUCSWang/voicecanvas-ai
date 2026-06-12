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
    expect(markup).toContain('marker-end="url(#arrow-head)"');
    expect(markup).toContain('>Demo text</text>');
  });

  it('shows a useful empty canvas hint before any drawing action exists', () => {
    const markup = renderToStaticMarkup(<Canvas state={createInitialDrawingState()} />);

    expect(markup).toContain('等待绘图动作');
  });
});
