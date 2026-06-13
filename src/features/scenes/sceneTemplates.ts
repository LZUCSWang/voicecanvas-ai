import type {
  CreateDrawingAction,
  DrawAction,
  DrawingObjectType,
  DrawingSize,
  SvgBounds,
  SvgPoint,
} from '../../domain/drawingTypes';

export const SCENE_TEMPLATE_TYPES = ['flowchart', 'mind-map', 'comparison', 'architecture', 'poster'] as const;
export type SceneTemplateType = (typeof SCENE_TEMPLATE_TYPES)[number];

export interface SceneTemplateInput {
  type: SceneTemplateType;
  title: string;
  items: string[];
}

const INK = '#111827';
const MUTED = '#475569';
const BLUE = '#2563eb';
const AMBER = '#d97706';
const PURPLE = '#7c3aed';
const TEAL = '#0f766e';
const ROSE = '#e11d48';
const SLATE = '#334155';

export function createSceneTemplateActions(input: SceneTemplateInput): DrawAction[] {
  switch (input.type) {
    case 'flowchart':
      return createFlowchartActions(input.title, input.items);
    case 'mind-map':
      return createMindMapActions(input.title, input.items);
    case 'comparison':
      return createComparisonActions(input.title, input.items);
    case 'architecture':
      return createArchitectureActions(input.title, input.items);
    case 'poster':
      return createPosterActions(input.title, input.items);
  }
}

function createFlowchartActions(title: string, items: string[]): DrawAction[] {
  const steps = normalizeItems(items, ['Input', 'Plan', 'Render'], 4);
  const stepWidth = Math.min(150, Math.floor((680 - (steps.length - 1) * 42) / steps.length));
  const gap = steps.length > 1 ? (680 - steps.length * stepWidth) / (steps.length - 1) : 0;
  const y = 210;
  const height = 82;
  const actions: DrawAction[] = [
    text(title, { x: 170, y: 38, width: 460, height: 46 }, 'medium', INK),
    line({ x: 150, y: 96 }, { x: 650, y: 96 }, MUTED),
  ];

  steps.forEach((step, index) => {
    const x = 60 + index * (stepWidth + gap);
    actions.push(rect({ x, y, width: stepWidth, height }, BLUE));
    actions.push(text(step, { x: x + 10, y: y + 16, width: stepWidth - 20, height: height - 32 }, 'small', INK));

    if (index < steps.length - 1) {
      actions.push(
        arrow({ x: x + stepWidth + 10, y: y + height / 2 }, { x: x + stepWidth + gap - 10, y: y + height / 2 }, PURPLE),
      );
    }
  });

  return actions;
}

function createMindMapActions(title: string, items: string[]): DrawAction[] {
  const branches = normalizeItems(items, ['Voice', 'Intent', 'Layout', 'Canvas'], 6);
  const center = { x: 325, y: 190, width: 150, height: 110 };
  const branchBounds = [
    { x: 80, y: 95, width: 150, height: 66 },
    { x: 570, y: 95, width: 150, height: 66 },
    { x: 78, y: 330, width: 154, height: 66 },
    { x: 568, y: 330, width: 154, height: 66 },
    { x: 325, y: 54, width: 150, height: 66 },
    { x: 325, y: 390, width: 150, height: 66 },
  ];
  const actions: DrawAction[] = [
    circle(center, TEAL, 'large'),
    text(title, center, 'small', INK),
  ];

  branches.forEach((branch, index) => {
    const bounds = branchBounds[index];
    actions.push(arrow(centerOf(center), centerOf(bounds), AMBER));
    actions.push(circle(bounds, BLUE, 'medium'));
    actions.push(text(branch, bounds, 'small', INK));
  });

  return actions;
}

function createComparisonActions(title: string, items: string[]): DrawAction[] {
  const normalized = normalizeItems(items, ['Option A', 'Option B', 'Fast path', 'Deep reasoning'], 6);
  const leftItems = normalized.filter((_, index) => index % 2 === 0);
  const rightItems = normalized.filter((_, index) => index % 2 === 1);
  const actions: DrawAction[] = [
    text(title, { x: 170, y: 34, width: 460, height: 44 }, 'medium', INK),
    rect({ x: 70, y: 94, width: 290, height: 340 }, BLUE),
    rect({ x: 440, y: 94, width: 290, height: 340 }, PURPLE),
    line({ x: 400, y: 110 }, { x: 400, y: 424 }, MUTED),
    text('方案 A', { x: 120, y: 114, width: 190, height: 40 }, 'small', INK),
    text('方案 B', { x: 490, y: 114, width: 190, height: 40 }, 'small', INK),
  ];

  leftItems.forEach((item, index) => {
    const bounds = { x: 102, y: 170 + index * 78, width: 226, height: 52 };
    actions.push(rect(bounds, TEAL));
    actions.push(text(item, bounds, 'small', INK));
  });
  rightItems.forEach((item, index) => {
    const bounds = { x: 472, y: 170 + index * 78, width: 226, height: 52 };
    actions.push(rect(bounds, ROSE));
    actions.push(text(item, bounds, 'small', INK));
  });

  return actions;
}

function createArchitectureActions(title: string, items: string[]): DrawAction[] {
  const modules = normalizeItems(items, ['Speech Input', 'Local Parser', 'Scene Templates', 'SVG Canvas'], 5);
  const actions: DrawAction[] = [
    text(title, { x: 140, y: 30, width: 520, height: 44 }, 'medium', INK),
  ];

  modules.forEach((module, index) => {
    const layerBounds = { x: 130, y: 92 + index * 70, width: 540, height: 54 };
    const moduleBounds = { x: 255, y: 100 + index * 70, width: 290, height: 38 };
    actions.push(rect(layerBounds, SLATE));
    actions.push(text(`Layer ${index + 1}`, { x: 148, y: 100 + index * 70, width: 84, height: 38 }, 'small', MUTED));
    actions.push(rect(moduleBounds, index % 2 === 0 ? BLUE : TEAL));
    actions.push(text(module, moduleBounds, 'small', INK));

    if (index < modules.length - 1) {
      actions.push(arrow({ x: 400, y: 148 + index * 70 }, { x: 400, y: 186 + index * 70 }, AMBER));
    }
  });

  actions.push(line({ x: 590, y: 118 }, { x: 590, y: 402 }, PURPLE));
  actions.push(text('data flow', { x: 606, y: 238, width: 95, height: 42 }, 'small', PURPLE));

  return actions;
}

function createPosterActions(title: string, items: string[]): DrawAction[] {
  const copy = normalizeItems(items, ['Speak it', 'See it', 'Share the canvas'], 4);
  const [emphasis, ...supporting] = copy;
  const actions: DrawAction[] = [
    rect({ x: 115, y: 58, width: 570, height: 384 }, SLATE),
    rect({ x: 155, y: 96, width: 490, height: 114 }, BLUE),
    circle({ x: 126, y: 76, width: 70, height: 70 }, AMBER, 'small'),
    circle({ x: 604, y: 358, width: 70, height: 70 }, ROSE, 'small'),
    text(title, { x: 180, y: 118, width: 440, height: 64 }, 'large', INK),
    rect({ x: 220, y: 240, width: 360, height: 68 }, TEAL),
    text(emphasis, { x: 240, y: 252, width: 320, height: 44 }, 'medium', INK),
  ];

  supporting.forEach((item, index) => {
    const bounds = { x: 198 + index * 142, y: 338, width: 122, height: 52 };
    actions.push(rect(bounds, index % 2 === 0 ? PURPLE : AMBER));
    actions.push(text(item, bounds, 'small', INK));
  });

  return actions;
}

function normalizeItems(items: string[], fallback: string[], maxItems: number): string[] {
  const cleaned = items.map((item) => item.trim()).filter(Boolean);
  return (cleaned.length > 0 ? cleaned : fallback).slice(0, maxItems);
}

function rect(bounds: SvgBounds, color: string): CreateDrawingAction {
  return createObject('rectangle', bounds, color, 'small');
}

function circle(bounds: SvgBounds, color: string, size: DrawingSize): CreateDrawingAction {
  return createObject('circle', bounds, color, size);
}

function text(value: string, bounds: SvgBounds, size: DrawingSize, color: string): CreateDrawingAction {
  return {
    type: 'create',
    objectType: 'text',
    color,
    position: 'center',
    size,
    text: value,
    customBounds: bounds,
  };
}

function line(start: SvgPoint, end: SvgPoint, color: string): CreateDrawingAction {
  return createLine('line', start, end, color);
}

function arrow(start: SvgPoint, end: SvgPoint, color: string): CreateDrawingAction {
  return createLine('arrow', start, end, color);
}

function createObject(
  objectType: DrawingObjectType,
  customBounds: SvgBounds,
  color: string,
  size: DrawingSize,
): CreateDrawingAction {
  return {
    type: 'create',
    objectType,
    color,
    position: 'center',
    size,
    customBounds,
  };
}

function createLine(objectType: 'line' | 'arrow', start: SvgPoint, end: SvgPoint, color: string): CreateDrawingAction {
  return {
    type: 'create',
    objectType,
    color,
    position: 'center',
    size: 'small',
    customLine: { start, end },
  };
}

function centerOf(bounds: SvgBounds): SvgPoint {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}
