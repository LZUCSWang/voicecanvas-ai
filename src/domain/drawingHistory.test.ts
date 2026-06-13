import { describe, expect, it } from 'vitest';
import { createSceneTemplateActions } from '../features/scenes/sceneTemplates';
import {
  createInitialDrawingHistoryState,
  executeDrawingHistoryActionWithResult,
  executeDrawingHistoryActionsWithResults,
} from './drawingHistory';
import type { DrawingHistoryAction } from './drawingTypes';

function applyActions(actions: DrawingHistoryAction[]) {
  return actions.reduce(
    (history, action) => executeDrawingHistoryActionWithResult(history, action).history,
    createInitialDrawingHistoryState(),
  );
}

describe('drawing history actions', () => {
  it('undoes consecutive create actions one step at a time', () => {
    const history = applyActions([
      { type: 'create', objectType: 'circle', color: '#ef4444' },
      { type: 'create', objectType: 'rectangle', color: '#2563eb' },
      { type: 'undo' },
    ]);

    expect(history.present.objects.map((object) => object.type)).toEqual(['circle']);
    expect(history.past).toHaveLength(1);
    expect(history.future).toHaveLength(1);
  });

  it('redoes the most recently undone action after undo', () => {
    const undone = applyActions([
      { type: 'create', objectType: 'circle', color: '#ef4444' },
      { type: 'create', objectType: 'rectangle', color: '#2563eb' },
      { type: 'undo' },
    ]);

    const redone = executeDrawingHistoryActionWithResult(undone, { type: 'redo' }).history;

    expect(redone.present.objects.map((object) => object.type)).toEqual(['circle', 'rectangle']);
    expect(redone.future).toHaveLength(0);
  });

  it('restores cleared objects when undoing clear', () => {
    const history = applyActions([
      { type: 'create', objectType: 'circle', color: '#ef4444' },
      { type: 'create', objectType: 'rectangle', color: '#2563eb' },
      { type: 'clear' },
      { type: 'undo' },
    ]);

    expect(history.present.objects.map((object) => object.type)).toEqual(['circle', 'rectangle']);
  });

  it('deletes the latest object and restores it with undo', () => {
    const history = applyActions([
      { type: 'create', objectType: 'circle', color: '#ef4444' },
      { type: 'create', objectType: 'rectangle', color: '#2563eb' },
      { type: 'delete' },
    ]);

    expect(history.present.objects.map((object) => object.type)).toEqual(['circle']);

    const restored = executeDrawingHistoryActionWithResult(history, { type: 'undo' }).history;

    expect(restored.present.objects.map((object) => object.type)).toEqual(['circle', 'rectangle']);
  });

  it('records AI fine-tuning update actions so undo restores the previous position', () => {
    const moved = applyActions([
      {
        type: 'create',
        objectType: 'arrow',
        color: '#7c3aed',
        customLine: { start: { x: 100, y: 120 }, end: { x: 220, y: 120 } },
      },
      {
        type: 'update',
        target: { objectType: 'arrow', strategy: 'latest' },
        changes: { translate: { dx: 24, dy: 0 } },
      },
    ]);
    const movedArrow = moved.present.objects[0];

    expect(movedArrow.bounds.x).toBe(124);

    const restored = executeDrawingHistoryActionWithResult(moved, { type: 'undo' }).history;

    expect(restored.present.objects[0].bounds.x).toBe(100);
    expect(restored.present.objects[0].geometry).toMatchObject({
      start: { x: 100, y: 120 },
      end: { x: 220, y: 120 },
    });
  });

  it('treats a generated scene batch as one undoable command', () => {
    const sceneActions = [
      { type: 'clear' },
      ...createSceneTemplateActions({
        type: 'flowchart',
        title: '登录流程',
        items: ['打开页面', '输入账号', '完成登录'],
      }),
    ] satisfies DrawingHistoryAction[];
    const generated = executeDrawingHistoryActionsWithResults(createInitialDrawingHistoryState(), sceneActions);

    expect(generated.history.present.objects.length).toBeGreaterThan(6);

    const undone = executeDrawingHistoryActionWithResult(generated.history, { type: 'undo' }).history;

    expect(undone.present.objects).toEqual([]);
    expect(undone.future).toHaveLength(1);
  });
});
