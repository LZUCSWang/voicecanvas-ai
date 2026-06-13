import { describe, expect, it } from 'vitest';
import { executeDrawingAction } from '../../domain/drawingExecutor';
import { createInitialDrawingState } from '../../domain/drawingState';
import type { DrawAction } from '../../domain/drawingTypes';
import { createSceneTemplateActions, SCENE_TEMPLATE_TYPES } from './sceneTemplates';

function getTextValues(actions: DrawAction[]) {
  return actions.flatMap((action) => {
    if (action.type === 'create' && action.objectType === 'text' && action.text) {
      return [action.text];
    }

    return [];
  });
}

describe('scene templates', () => {
  it.each(SCENE_TEMPLATE_TYPES)('generates multiple actions for %s with title and node text', (templateType) => {
    const actions = createSceneTemplateActions({
      type: templateType,
      title: 'VoiceCanvas Plan',
      items: ['Capture voice', 'Parse command', 'Render scene', 'Review result'],
    });

    expect(actions.length).toBeGreaterThan(6);
    expect(getTextValues(actions)).toContain('VoiceCanvas Plan');
    expect(getTextValues(actions)).toContain('Capture voice');
  });

  it('builds a flowchart with step boxes and arrows', () => {
    const actions = createSceneTemplateActions({
      type: 'flowchart',
      title: 'Demo Flow',
      items: ['Listen', 'Understand', 'Draw'],
    });

    expect(actions.filter((action) => action.type === 'create' && action.objectType === 'rectangle')).toHaveLength(3);
    expect(actions.filter((action) => action.type === 'create' && action.objectType === 'arrow')).toHaveLength(2);
    expect(getTextValues(actions)).toEqual(expect.arrayContaining(['Demo Flow', 'Listen', 'Understand', 'Draw']));
  });

  it('builds a mind map with a center topic and branch connectors', () => {
    const actions = createSceneTemplateActions({
      type: 'mind-map',
      title: 'AI Drawing',
      items: ['Voice', 'Intent', 'Layout', 'Canvas'],
    });

    expect(actions.filter((action) => action.type === 'create' && action.objectType === 'circle').length).toBeGreaterThan(1);
    expect(actions.filter((action) => action.type === 'create' && action.objectType === 'arrow').length).toBeGreaterThan(2);
    expect(getTextValues(actions)).toEqual(expect.arrayContaining(['AI Drawing', 'Voice', 'Canvas']));
  });

  it('builds a comparison scene with two visual columns', () => {
    const actions = createSceneTemplateActions({
      type: 'comparison',
      title: 'Local vs Cloud',
      items: ['Local parsing', 'AI fallback', 'Fast feedback', 'Complex scenes'],
    });

    const rectangles = actions.filter((action) => action.type === 'create' && action.objectType === 'rectangle');
    const lines = actions.filter((action) => action.type === 'create' && action.objectType === 'line');

    expect(rectangles.length).toBeGreaterThanOrEqual(6);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(getTextValues(actions)).toEqual(expect.arrayContaining(['Local vs Cloud', 'Local parsing', 'AI fallback']));
  });

  it('builds an architecture scene with layered modules and data flow arrows', () => {
    const actions = createSceneTemplateActions({
      type: 'architecture',
      title: 'VoiceCanvas Architecture',
      items: ['Speech Input', 'Local Parser', 'Scene Templates', 'SVG Canvas'],
    });

    expect(actions.filter((action) => action.type === 'create' && action.objectType === 'rectangle').length).toBeGreaterThan(4);
    expect(actions.filter((action) => action.type === 'create' && action.objectType === 'arrow').length).toBeGreaterThanOrEqual(3);
    expect(getTextValues(actions)).toEqual(expect.arrayContaining(['VoiceCanvas Architecture', 'Speech Input', 'SVG Canvas']));
  });

  it('builds a poster with title, emphasis text, and supporting visual elements', () => {
    const actions = createSceneTemplateActions({
      type: 'poster',
      title: 'Launch Night',
      items: ['Speak it', 'See it', 'Share the canvas'],
    });

    expect(actions.filter((action) => action.type === 'create' && action.objectType === 'rectangle').length).toBeGreaterThanOrEqual(3);
    expect(actions.filter((action) => action.type === 'create' && action.objectType === 'circle').length).toBeGreaterThanOrEqual(2);
    expect(getTextValues(actions)).toEqual(expect.arrayContaining(['Launch Night', 'Speak it', 'Share the canvas']));
  });

  it('can clear the canvas and regenerate a structured scene with fresh ids', () => {
    const initialState = [{ type: 'create', objectType: 'circle', color: '#ef4444' } satisfies DrawAction].reduce(
      executeDrawingAction,
      createInitialDrawingState(),
    );
    const regeneratedState = [
      { type: 'clear' } satisfies DrawAction,
      ...createSceneTemplateActions({
        type: 'flowchart',
        title: 'Fresh Flow',
        items: ['Start', 'Build', 'Verify'],
      }),
    ].reduce(executeDrawingAction, initialState);

    expect(regeneratedState.objects.length).toBeGreaterThan(6);
    expect(regeneratedState.objects[0].id).toBe('drawing-object-1');
    expect(regeneratedState.objects.some((object) => object.type === 'text' && object.text === 'Fresh Flow')).toBe(true);
  });
});
