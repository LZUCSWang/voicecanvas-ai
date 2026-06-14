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
  const steps = normalizeItems(items, ['Input', 'Plan', 'Render'], 6);
  const actions: DrawAction[] = [
    text(title, { x: 170, y: 38, width: 460, height: 46 }, 'medium', INK),
    line({ x: 150, y: 96 }, { x: 650, y: 96 }, MUTED),
  ];

  if (steps.length <= 4) {
    const stepWidth = Math.min(150, Math.floor((680 - (steps.length - 1) * 42) / steps.length));
    const gap = steps.length > 1 ? (680 - steps.length * stepWidth) / (steps.length - 1) : 0;
    const y = 210;
    const height = 82;

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

  const stepBounds = createWrappedFlowchartBounds(steps.length);

  steps.forEach((step, index) => {
    const bounds = stepBounds[index];
    actions.push(rect(bounds, BLUE));
    actions.push(text(step, { x: bounds.x + 12, y: bounds.y + 14, width: bounds.width - 24, height: bounds.height - 28 }, 'small', INK));

    if (index < steps.length - 1) {
      actions.push(createFlowchartConnector(bounds, stepBounds[index + 1]));
    }
  });

  return actions;
}

function createWrappedFlowchartBounds(stepCount: number): SvgBounds[] {
  const width = 170;
  const height = 70;
  const columnGap = 75;
  const left = 70;
  const topRowY = 150;
  const bottomRowY = 310;

  return Array.from({ length: stepCount }, (_, index) => {
    if (index < 3) {
      return { x: left + index * (width + columnGap), y: topRowY, width, height };
    }

    const rowIndex = index - 3;
    return { x: left + (2 - rowIndex) * (width + columnGap), y: bottomRowY, width, height };
  });
}

function createFlowchartConnector(from: SvgBounds, to: SvgBounds): CreateDrawingAction {
  const fromCenterY = from.y + from.height / 2;
  const toCenterY = to.y + to.height / 2;

  if (from.y === to.y && to.x > from.x) {
    return arrow({ x: from.x + from.width + 12, y: fromCenterY }, { x: to.x - 12, y: toCenterY }, PURPLE);
  }

  if (from.y === to.y) {
    return arrow({ x: from.x - 12, y: fromCenterY }, { x: to.x + to.width + 12, y: toCenterY }, PURPLE);
  }

  return arrow(
    { x: from.x + from.width / 2, y: from.y + from.height + 12 },
    { x: to.x + to.width / 2, y: to.y - 12 },
    PURPLE,
  );
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
  const [leftHeading, rightHeading] = createComparisonColumnHeadings(title, leftItems, rightItems);
  const actions: DrawAction[] = [
    text(title, { x: 170, y: 34, width: 460, height: 44 }, 'medium', INK),
    rect({ x: 70, y: 94, width: 290, height: 340 }, BLUE),
    rect({ x: 440, y: 94, width: 290, height: 340 }, PURPLE),
    line({ x: 400, y: 110 }, { x: 400, y: 424 }, MUTED),
    text(leftHeading, { x: 120, y: 114, width: 190, height: 40 }, 'small', INK),
    text(rightHeading, { x: 490, y: 114, width: 190, height: 40 }, 'small', INK),
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

function createComparisonColumnHeadings(title: string, leftItems: string[], rightItems: string[]): [string, string] {
  const leftText = `${title} ${leftItems.join(' ')}`;
  const rightText = `${title} ${rightItems.join(' ')}`;

  if (leftText.includes('本地') && (rightText.includes('云端') || rightText.includes('AI'))) {
    return ['本地规则', '云端 AI'];
  }

  return ['方案 A', '方案 B'];
}

function createArchitectureActions(title: string, items: string[]): DrawAction[] {
  if (isTransformerArchitecture(title, items)) {
    return createTransformerArchitectureActions(title, items);
  }

  const modules = normalizeItems(items, ['Speech Input', 'Local Parser', 'Scene Templates', 'SVG Canvas'], 5);
  const layerLeft = 100;
  const layerWidth = 500;
  const layerHeight = 48;
  const layerGap = 30;
  const layerTop = 86;
  const layerBounds = modules.map((_, index) => ({
    x: layerLeft,
    y: layerTop + index * (layerHeight + layerGap),
    width: layerWidth,
    height: layerHeight,
  }));
  const moduleBounds = layerBounds.map((bounds) => ({
    x: 230,
    y: bounds.y + 8,
    width: 260,
    height: 32,
  }));
  const actions: DrawAction[] = [
    text(title, { x: 140, y: 30, width: 520, height: 44 }, 'medium', INK),
  ];

  modules.forEach((module, index) => {
    const currentLayerBounds = layerBounds[index];
    const currentModuleBounds = moduleBounds[index];
    actions.push(rect(currentLayerBounds, SLATE));
    actions.push(text(`Layer ${index + 1}`, { x: 118, y: currentLayerBounds.y + 8, width: 84, height: 32 }, 'small', MUTED));
    actions.push(rect(currentModuleBounds, index % 2 === 0 ? BLUE : TEAL));
    actions.push(text(module, currentModuleBounds, 'small', INK));

    if (index < modules.length - 1) {
      const nextLayerBounds = layerBounds[index + 1];
      const nextModuleBounds = moduleBounds[index + 1];
      actions.push(
        arrow(
          { x: centerOf(currentModuleBounds).x, y: currentLayerBounds.y + currentLayerBounds.height + 6 },
          { x: centerOf(nextModuleBounds).x, y: nextLayerBounds.y - 8 },
          AMBER,
        ),
      );
    }
  });

  const lastLayerBounds = layerBounds[layerBounds.length - 1];
  actions.push(line({ x: 638, y: layerTop + 12 }, { x: 638, y: lastLayerBounds.y + lastLayerBounds.height - 12 }, PURPLE));
  actions.push(text('data flow', { x: 654, y: 238, width: 95, height: 42 }, 'small', PURPLE));

  return actions;
}

function createTransformerArchitectureActions(title: string, items: string[]): DrawAction[] {
  const labels = normalizeTransformerLabels(items);
  const moduleBounds = [
    { x: 268, y: 82, width: 264, height: 42 },
    { x: 268, y: 142, width: 264, height: 42 },
    { x: 268, y: 202, width: 264, height: 42 },
    { x: 268, y: 262, width: 264, height: 42 },
    { x: 268, y: 322, width: 264, height: 42 },
    { x: 268, y: 382, width: 264, height: 42 },
  ];
  const colors = [BLUE, TEAL, PURPLE, SLATE, AMBER, TEAL];
  const actions: DrawAction[] = [
    text(title, { x: 132, y: 24, width: 536, height: 38 }, 'medium', INK),
    rect({ x: 232, y: 70, width: 336, height: 366 }, '#e2e8f0'),
    text('Encoder block', { x: 590, y: 354, width: 104, height: 30 }, 'small', MUTED),
    line({ x: 568, y: 92 }, { x: 568, y: 420 }, MUTED),
    arrow({ x: 400, y: 62 }, { x: 400, y: 77 }, ROSE),
  ];

  moduleBounds.forEach((bounds, index) => {
    actions.push(rect(bounds, colors[index]));
    actions.push(text(labels[index], { x: bounds.x + 10, y: bounds.y + 8, width: bounds.width - 20, height: bounds.height - 16 }, 'small', INK));

    if (index < moduleBounds.length - 1) {
      actions.push(arrow({ x: 400, y: bounds.y + bounds.height + 5 }, { x: 400, y: moduleBounds[index + 1].y - 5 }, ROSE));
    }
  });

  actions.push(line({ x: 174, y: 163 }, { x: 260, y: 163 }, AMBER));
  actions.push(text('tokens + position', { x: 68, y: 142, width: 104, height: 42 }, 'small', MUTED));
  actions.push(line({ x: 540, y: 223 }, { x: 646, y: 223 }, AMBER));
  actions.push(text('attention weights', { x: 656, y: 210, width: 88, height: 28 }, 'small', MUTED));

  return actions;
}

function isTransformerArchitecture(title: string, items: string[]): boolean {
  const haystack = `${title} ${items.join(' ')}`.toLowerCase();

  return ['transformer', 'attention', 'self-attention', 'embedding', 'positional', 'feed-forward', 'ffn', '编码器'].some((keyword) =>
    haystack.includes(keyword),
  );
}

function normalizeTransformerLabels(items: string[]): string[] {
  const haystack = items.join(' ');
  const input = findLabel(items, ['输入', 'input', 'token']) ?? 'Input Embedding';
  const position = findLabel(items, ['位置', 'position']) ?? 'Positional Encoding';
  const attention = findLabel(items, ['注意力', 'attention']) ?? 'Multi-Head Self-Attention';
  const ffn = findLabel(items, ['前馈', 'feed', 'ffn']) ?? 'Feed Forward Network';
  const output = findLabel(items, ['输出', 'output']) ?? 'Output Representation';

  return [
    normalizeTransformerLabel(input, 'Input Embedding'),
    normalizeTransformerLabel(position, 'Positional Encoding'),
    normalizeTransformerLabel(attention, 'Multi-Head Self-Attention'),
    haystack.includes('norm') || haystack.includes('归一') ? 'Add & Norm' : 'Add & Norm',
    normalizeTransformerLabel(ffn, 'Feed Forward Network'),
    normalizeTransformerLabel(output, 'Output Representation'),
  ];
}

function findLabel(items: string[], keywords: string[]): string | null {
  return items.find((item) => keywords.some((keyword) => item.toLowerCase().includes(keyword))) ?? null;
}

function normalizeTransformerLabel(label: string, fallback: string): string {
  const normalized = label.toLowerCase();

  if (normalized.includes('feed') || normalized.includes('ffn') || label.includes('前馈')) {
    return 'Feed Forward Network';
  }

  if (normalized.includes('self-attention') || normalized.includes('attention') || label.includes('注意力')) {
    return 'Multi-Head Self-Attention';
  }

  if (normalized.includes('position') || label.includes('位置')) {
    return 'Positional Encoding';
  }

  if (normalized.includes('embedding') || label.includes('嵌入')) {
    return 'Input Embedding';
  }

  if (normalized.includes('output') || label.includes('输出')) {
    return 'Output Representation';
  }

  const match = label.match(/\(([^)]+)\)/);

  if (match?.[1]) {
    return match[1].trim();
  }

  if (/[\u4e00-\u9fff]/.test(label)) {
    return fallback;
  }

  return label.trim() || fallback;
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
