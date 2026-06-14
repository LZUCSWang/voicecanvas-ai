import { describe, expect, it } from 'vitest';
import { executeDrawingAction } from '../../domain/drawingExecutor';
import { createInitialDrawingState } from '../../domain/drawingState';
import type { DrawAction, SvgBounds, SvgPoint } from '../../domain/drawingTypes';
import { createSceneTemplateActions, SCENE_TEMPLATE_TYPES } from './sceneTemplates';

function getTextValues(actions: DrawAction[]) {
  return actions.flatMap((action) => {
    if (action.type === 'create' && action.objectType === 'text' && action.text) {
      return [action.text];
    }

    return [];
  });
}

function getCreatedObjects(actions: DrawAction[]) {
  return actions.filter((action): action is Extract<DrawAction, { type: 'create' }> => action.type === 'create');
}

function verticalSegmentCrossesBounds(line: { start: SvgPoint; end: SvgPoint }, bounds: SvgBounds): boolean {
  const minY = Math.min(line.start.y, line.end.y);
  const maxY = Math.max(line.start.y, line.end.y);
  const x = line.start.x;

  return x > bounds.x && x < bounds.x + bounds.width && maxY > bounds.y && minY < bounds.y + bounds.height;
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

  it('keeps every step in a five item flowchart and wraps it onto two rows', () => {
    const actions = createSceneTemplateActions({
      type: 'flowchart',
      title: '登录流程图',
      items: ['开始', '输入用户名密码', '验证凭据', '成功登录', '结束'],
    });
    const rectangles = actions.filter((action) => action.type === 'create' && action.objectType === 'rectangle');
    const rowYs = new Set(rectangles.map((action) => action.type === 'create' && action.customBounds?.y));

    expect(rectangles).toHaveLength(5);
    expect(actions.filter((action) => action.type === 'create' && action.objectType === 'arrow')).toHaveLength(4);
    expect(rowYs.size).toBe(2);
    expect(getTextValues(actions)).toEqual(expect.arrayContaining(['开始', '输入用户名密码', '验证凭据', '成功登录', '结束']));
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

  it('labels local and cloud comparison columns with demo-specific names', () => {
    const actions = createSceneTemplateActions({
      type: 'comparison',
      title: '本地解析 vs 云端 AI',
      items: ['本地规则离线解析', '云端 AI 上下文解析', '低延迟可靠命令', '复杂语义生成场景'],
    });

    expect(getTextValues(actions)).toEqual(expect.arrayContaining(['本地规则', '云端 AI']));
    expect(getTextValues(actions)).not.toEqual(expect.arrayContaining(['方案 A', '方案 B']));
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

  it('keeps architecture connector arrows and the data-flow rail outside layer rectangles', () => {
    const actions = createSceneTemplateActions({
      type: 'architecture',
      title: 'VoiceCanvas 完整链路',
      items: ['语音识别', '对话历史', '当前画布上下文', 'ModelScope 解析', 'Action 执行'],
    });
    const createdObjects = getCreatedObjects(actions);
    const rectangles = createdObjects
      .filter((action) => action.objectType === 'rectangle' && action.customBounds)
      .map((action) => action.customBounds as SvgBounds);
    const layerRectangles = rectangles.filter((bounds) => bounds.width > 500);
    const connectorArrows = createdObjects.filter(
      (action) => action.objectType === 'arrow' && action.customLine && action.customLine.start.x === action.customLine.end.x,
    );
    const dataFlowRail = createdObjects.find(
      (action) => action.objectType === 'line' && action.customLine && action.customLine.start.x === action.customLine.end.x,
    );
    const maxLayerRight = Math.max(...layerRectangles.map((bounds) => bounds.x + bounds.width));

    expect(connectorArrows).toHaveLength(4);
    connectorArrows.forEach((arrow) => {
      expect(rectangles.some((bounds) => verticalSegmentCrossesBounds(arrow.customLine!, bounds))).toBe(false);
    });
    expect(dataFlowRail?.customLine?.start.x).toBeGreaterThan(maxLayerRight + 16);
    expect(layerRectangles.some((bounds) => verticalSegmentCrossesBounds(dataFlowRail!.customLine!, bounds))).toBe(false);
  });

  it('builds a transformer encoder architecture with attention, add norm, feed forward, and vertical flow', () => {
    const actions = createSceneTemplateActions({
      type: 'architecture',
      title: 'Transformer Encoder',
      items: [
        '输入嵌入 (Input Embedding)',
        '位置编码 (Positional Encoding)',
        '多头自注意力 (Multi-Head Self-Attention)',
        '前馈神经网络 (Feed-Forward Neural Network)',
        '输出表示 (Output Representation)',
      ],
    });
    const labels = getTextValues(actions);
    const rectangles = actions.filter((action) => action.type === 'create' && action.objectType === 'rectangle');
    const arrows = actions.filter((action) => action.type === 'create' && action.objectType === 'arrow');

    expect(labels).toEqual(
      expect.arrayContaining([
        'Transformer Encoder',
        'Input Embedding',
        'Positional Encoding',
        'Multi-Head Self-Attention',
        'Add & Norm',
        'Feed Forward Network',
        'Output Representation',
      ]),
    );
    expect(labels).not.toContain('Layer 1');
    expect(rectangles.length).toBeGreaterThanOrEqual(7);
    expect(arrows.length).toBeGreaterThanOrEqual(6);
    expect(arrows.every((action) => action.type === 'create' && action.customLine && action.customLine.end.y > action.customLine.start.y)).toBe(true);
    expect(actions).toContainEqual(
      expect.objectContaining({
        type: 'create',
        objectType: 'text',
        text: 'attention weights',
        customBounds: { x: 656, y: 210, width: 88, height: 28 },
      }),
    );
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
