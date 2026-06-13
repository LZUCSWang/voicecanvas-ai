import { describe, expect, it } from 'vitest';
import { executeDrawingAction, executeDrawingActionWithResult } from './drawingExecutor';
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

  it('supports optional custom bounds and custom line points without changing base actions', () => {
    const actions: DrawAction[] = [
      {
        type: 'create',
        objectType: 'rectangle',
        color: '#0f766e',
        position: 'center',
        size: 'medium',
        customBounds: { x: 120, y: 80, width: 180, height: 70 },
      },
      {
        type: 'create',
        objectType: 'arrow',
        color: '#7c3aed',
        position: 'center',
        size: 'small',
        customLine: {
          start: { x: 300, y: 115 },
          end: { x: 460, y: 220 },
        },
      },
    ];

    const state = actions.reduce(executeDrawingAction, createInitialDrawingState());

    expect(state.objects[0]).toMatchObject({
      type: 'rectangle',
      bounds: { x: 120, y: 80, width: 180, height: 70 },
      geometry: { kind: 'rectangle', x: 120, y: 80, width: 180, height: 70 },
    });
    expect(state.objects[1]).toMatchObject({
      type: 'arrow',
      bounds: { x: 300, y: 115, width: 160, height: 105 },
      geometry: {
        kind: 'arrow',
        start: { x: 300, y: 115 },
        end: { x: 460, y: 220 },
      },
    });
  });

  it('resolves target selectors by id, type, color, position, text, and strategy', () => {
    const actions: DrawAction[] = [
      { type: 'create', objectType: 'rectangle', color: '#2563eb', position: 'top-left', size: 'medium' },
      { type: 'create', objectType: 'rectangle', color: '#16a34a', position: 'bottom-right', size: 'medium' },
      { type: 'create', objectType: 'text', color: '#111827', position: 'bottom-right', size: 'small', text: '登录成功' },
    ];
    const state = actions.reduce(executeDrawingAction, createInitialDrawingState());

    const latestRectangle = executeDrawingActionWithResult(state, {
      type: 'update',
      target: { objectType: 'rectangle' },
      changes: { color: '#ef4444' },
    });
    expect(latestRectangle.changed).toBe(true);
    expect(latestRectangle.targetBefore?.id).toBe('drawing-object-2');
    expect(latestRectangle.state.objects[1].color).toBe('#ef4444');

    const firstRectangle = executeDrawingActionWithResult(state, {
      type: 'update',
      target: { objectType: 'rectangle', strategy: 'first' },
      changes: { color: '#f97316' },
    });
    expect(firstRectangle.targetBefore?.id).toBe('drawing-object-1');
    expect(firstRectangle.state.objects[0].color).toBe('#f97316');

    const blueRectangle = executeDrawingActionWithResult(state, {
      type: 'update',
      target: { objectType: 'rectangle', color: '#2563eb' },
      changes: { color: '#16a34a' },
    });
    expect(blueRectangle.targetBefore?.id).toBe('drawing-object-1');

    const bottomRightText = executeDrawingActionWithResult(state, {
      type: 'update',
      target: { objectType: 'text', position: 'bottom-right', textIncludes: '成功' },
      changes: { text: '完成' },
    });
    expect(bottomRightText.targetBefore?.id).toBe('drawing-object-3');
    expect(bottomRightText.state.objects[2].text).toBe('完成');

    const byLegacyTargetId = executeDrawingActionWithResult(state, {
      type: 'update',
      targetId: 'drawing-object-1',
      changes: { color: '#7c3aed' },
    });
    expect(byLegacyTargetId.targetBefore?.id).toBe('drawing-object-1');
    expect(byLegacyTargetId.state.objects[0].color).toBe('#7c3aed');
  });

  it('keeps the state unchanged and reports feedback when a selector finds no object', () => {
    const state = executeDrawingAction(createInitialDrawingState(), {
      type: 'create',
      objectType: 'circle',
      color: '#ef4444',
      position: 'center',
      size: 'medium',
    });

    const result = executeDrawingActionWithResult(state, {
      type: 'update',
      target: { objectType: 'rectangle' },
      changes: { color: '#16a34a' },
    });

    expect(result.state).toBe(state);
    expect(result.changed).toBe(false);
    expect(result.feedbackText).toBe('未找到矩形');
  });

  it('translates, scales, and resizes shapes while keeping line bounds in sync with endpoints', () => {
    const actions: DrawAction[] = [
      { type: 'create', objectType: 'rectangle', color: '#2563eb', position: 'center', size: 'medium' },
      { type: 'create', objectType: 'circle', color: '#ef4444', position: 'left', size: 'small' },
      {
        type: 'create',
        objectType: 'arrow',
        color: '#7c3aed',
        position: 'center',
        size: 'small',
        customLine: { start: { x: 100, y: 120 }, end: { x: 220, y: 120 } },
      },
    ];
    const state = actions.reduce(executeDrawingAction, createInitialDrawingState());

    const translated = executeDrawingActionWithResult(state, {
      type: 'update',
      target: { objectType: 'rectangle' },
      changes: { translate: { dx: 24, dy: -12 } },
    }).state;
    expect(translated.objects[0].bounds).toEqual({ x: 354, y: 188, width: 140, height: 100 });
    expect(translated.objects[0].geometry).toMatchObject({ kind: 'rectangle', x: 354, y: 188 });

    const scaled = executeDrawingActionWithResult(translated, {
      type: 'update',
      target: { objectType: 'circle' },
      changes: { scale: 1.25 },
    }).state;
    expect(scaled.objects[1].bounds).toEqual({ x: 30, y: 212.5, width: 100, height: 75 });
    expect(scaled.objects[1].geometry).toMatchObject({ kind: 'circle', cx: 80, cy: 250, radius: 37.5 });

    const resizedArrow = executeDrawingActionWithResult(scaled, {
      type: 'update',
      target: { objectType: 'arrow' },
      changes: { translate: { dx: 10, dy: 20 }, resize: { dw: 40, dh: 30 } },
    }).state.objects[2];

    expect(resizedArrow.bounds).toEqual({ x: 110, y: 140, width: 160, height: 30 });
    expect(resizedArrow.geometry).toEqual({
      kind: 'arrow',
      start: { x: 110, y: 140 },
      end: { x: 270, y: 170 },
    });
  });

  it('updates style, text, and layer order with target selectors', () => {
    const actions: DrawAction[] = [
      { type: 'create', objectType: 'rectangle', color: '#2563eb', position: 'left', size: 'medium' },
      { type: 'create', objectType: 'arrow', color: '#7c3aed', position: 'center', size: 'small' },
      { type: 'create', objectType: 'text', color: '#111827', position: 'bottom-right', size: 'small', text: '草稿' },
    ];
    const state = actions.reduce(executeDrawingAction, createInitialDrawingState());

    const styled = executeDrawingActionWithResult(state, {
      type: 'update',
      target: { objectType: 'rectangle' },
      changes: {
        strokeWidthDelta: 2,
        strokeStyle: 'dashed',
        fillOpacityDelta: -0.04,
      },
    }).state;

    expect(styled.objects[0].style).toEqual({
      strokeWidth: 6,
      strokeStyle: 'dashed',
      fillOpacity: 0.1,
    });

    const textUpdated = executeDrawingActionWithResult(styled, {
      type: 'update',
      target: { objectType: 'text', position: 'bottom-right' },
      changes: { text: '完成', scale: 1.2 },
    }).state;
    expect(textUpdated.objects[2]).toMatchObject({
      type: 'text',
      text: '完成',
      geometry: { kind: 'text', fontSize: 28.8 },
    });

    const frontLayer = executeDrawingActionWithResult(textUpdated, {
      type: 'update',
      target: { objectType: 'rectangle' },
      changes: { layer: 'front' },
    }).state;
    expect(frontLayer.objects.map((object) => object.id)).toEqual([
      'drawing-object-2',
      'drawing-object-3',
      'drawing-object-1',
    ]);

    const backwardLayer = executeDrawingActionWithResult(frontLayer, {
      type: 'update',
      target: { id: 'drawing-object-1' },
      changes: { layer: 'backward' },
    }).state;
    expect(backwardLayer.objects.map((object) => object.id)).toEqual([
      'drawing-object-2',
      'drawing-object-1',
      'drawing-object-3',
    ]);
  });

  it('deletes specified objects by selector without removing unrelated objects', () => {
    const actions: DrawAction[] = [
      { type: 'create', objectType: 'rectangle', color: '#2563eb', position: 'left', size: 'medium' },
      { type: 'create', objectType: 'circle', color: '#ef4444', position: 'center', size: 'small' },
      { type: 'create', objectType: 'rectangle', color: '#16a34a', position: 'right', size: 'medium' },
    ];
    const state = actions.reduce(executeDrawingAction, createInitialDrawingState());

    const deletedLatestRectangle = executeDrawingActionWithResult(state, {
      type: 'delete',
      target: { objectType: 'rectangle' },
    });
    expect(deletedLatestRectangle.changed).toBe(true);
    expect(deletedLatestRectangle.targetBefore?.id).toBe('drawing-object-3');
    expect(deletedLatestRectangle.state.objects.map((object) => object.id)).toEqual(['drawing-object-1', 'drawing-object-2']);

    const deletedFirstRectangle = executeDrawingActionWithResult(state, {
      type: 'delete',
      target: { objectType: 'rectangle', strategy: 'first' },
    }).state;
    expect(deletedFirstRectangle.objects.map((object) => object.id)).toEqual(['drawing-object-2', 'drawing-object-3']);
  });
});
