import { describe, expect, it } from 'vitest';
import { executeDrawingAction } from './drawingExecutor';
import { createInitialDrawingState } from './drawingState';
import type { DrawAction } from './drawingTypes';

describe('drawing action executor', () => {
  it('creates supported objects with stable ids, colors, positions, and sizes', () => {
    const actions: DrawAction[] = [
      { type: 'create', objectType: 'circle', color: '#ef4444', position: 'center', size: 'small' },
      { type: 'create', objectType: 'rectangle', color: '#2563eb', position: 'top-left', size: 'medium' },
      { type: 'create', objectType: 'triangle', color: '#16a34a', position: 'top-right', size: 'large' },
      { type: 'create', objectType: 'line', color: '#f59e0b', position: 'bottom-left', size: 'small' },
      { type: 'create', objectType: 'arrow', color: '#7c3aed', position: 'bottom-right', size: 'medium' },
      { type: 'create', objectType: 'text', color: '#111827', position: 'right', size: 'large', text: 'VoiceCanvas' },
    ];

    const state = actions.reduce(executeDrawingAction, createInitialDrawingState());

    expect(state.objects).toHaveLength(6);
    expect(state.objects.map((object) => object.id)).toEqual([
      'drawing-object-1',
      'drawing-object-2',
      'drawing-object-3',
      'drawing-object-4',
      'drawing-object-5',
      'drawing-object-6',
    ]);
    expect(state.objects.map((object) => object.type)).toEqual([
      'circle',
      'rectangle',
      'triangle',
      'line',
      'arrow',
      'text',
    ]);
    expect(state.objects[0]).toMatchObject({
      color: '#ef4444',
      position: 'center',
      size: 'small',
      bounds: { x: 360, y: 220, width: 80, height: 60 },
    });
    expect(state.objects[1]).toMatchObject({
      color: '#2563eb',
      position: 'top-left',
      size: 'medium',
      bounds: { x: 40, y: 40, width: 140, height: 100 },
    });
    expect(state.objects[2]).toMatchObject({
      color: '#16a34a',
      position: 'top-right',
      size: 'large',
      bounds: { x: 540, y: 40, width: 220, height: 160 },
    });
    expect(state.objects[3]).toMatchObject({
      color: '#f59e0b',
      position: 'bottom-left',
      size: 'small',
      bounds: { x: 40, y: 400, width: 80, height: 60 },
    });
    expect(state.objects[4]).toMatchObject({
      color: '#7c3aed',
      position: 'bottom-right',
      size: 'medium',
      bounds: { x: 620, y: 360, width: 140, height: 100 },
    });
    expect(state.objects[5]).toMatchObject({
      color: '#111827',
      position: 'right',
      size: 'large',
      bounds: { x: 540, y: 170, width: 220, height: 160 },
      text: 'VoiceCanvas',
    });
  });

  it('updates the most recently created object when no target id is provided', () => {
    const firstState = executeDrawingAction(createInitialDrawingState(), {
      type: 'create',
      objectType: 'circle',
      color: '#ef4444',
      position: 'left',
      size: 'small',
    });
    const secondState = executeDrawingAction(firstState, {
      type: 'create',
      objectType: 'text',
      color: '#111827',
      position: 'top',
      size: 'small',
      text: 'Draft',
    });

    const updatedState = executeDrawingAction(secondState, {
      type: 'update',
      changes: {
        color: '#2563eb',
        position: 'bottom',
        size: 'large',
        text: 'Done',
      },
    });

    expect(updatedState.objects[0]).toMatchObject({
      id: 'drawing-object-1',
      color: '#ef4444',
      position: 'left',
      size: 'small',
    });
    expect(updatedState.objects[1]).toMatchObject({
      id: 'drawing-object-2',
      type: 'text',
      color: '#2563eb',
      position: 'bottom',
      size: 'large',
      bounds: { x: 290, y: 300, width: 220, height: 160 },
      text: 'Done',
    });
  });

  it('deletes the most recently created object when no target id is provided', () => {
    const actions: DrawAction[] = [
      { type: 'create', objectType: 'circle', color: '#ef4444', position: 'center', size: 'small' },
      { type: 'create', objectType: 'rectangle', color: '#2563eb', position: 'center', size: 'medium' },
      { type: 'delete' },
    ];
    const state = actions.reduce(executeDrawingAction, createInitialDrawingState());

    expect(state.objects).toHaveLength(1);
    expect(state.objects[0]).toMatchObject({
      id: 'drawing-object-1',
      type: 'circle',
    });
  });

  it('clears every object and resets id generation for a fresh drawing', () => {
    const actions: DrawAction[] = [
      { type: 'create', objectType: 'circle', color: '#ef4444', position: 'center', size: 'small' },
      { type: 'create', objectType: 'rectangle', color: '#2563eb', position: 'center', size: 'medium' },
      { type: 'clear' },
    ];
    const filledState = actions.reduce(executeDrawingAction, createInitialDrawingState());

    const nextState = executeDrawingAction(filledState, {
      type: 'create',
      objectType: 'triangle',
      color: '#16a34a',
      position: 'bottom',
      size: 'large',
    });

    expect(filledState.objects).toEqual([]);
    expect(nextState.objects).toHaveLength(1);
    expect(nextState.objects[0]).toMatchObject({
      id: 'drawing-object-1',
      type: 'triangle',
      position: 'bottom',
    });
  });
});
