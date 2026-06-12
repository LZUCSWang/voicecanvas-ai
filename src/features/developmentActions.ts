import type { DrawAction } from '../domain/drawingTypes';

export interface DevelopmentActionPreset {
  id: string;
  label: string;
  aliases: string[];
  action: DrawAction;
}

export const DEVELOPMENT_ACTION_PRESETS: DevelopmentActionPreset[] = [
  {
    id: 'circle',
    label: '红色圆形',
    aliases: ['circle', '圆形', '红色圆形'],
    action: { type: 'create', objectType: 'circle', color: '#ef4444', position: 'center', size: 'medium' },
  },
  {
    id: 'rectangle',
    label: '蓝色矩形',
    aliases: ['rectangle', 'rect', '矩形', '蓝色矩形'],
    action: { type: 'create', objectType: 'rectangle', color: '#2563eb', position: 'left', size: 'medium' },
  },
  {
    id: 'triangle',
    label: '绿色三角形',
    aliases: ['triangle', '三角形', '绿色三角形'],
    action: { type: 'create', objectType: 'triangle', color: '#16a34a', position: 'top', size: 'medium' },
  },
  {
    id: 'line',
    label: '黄色直线',
    aliases: ['line', '直线', '线条', '黄色直线'],
    action: { type: 'create', objectType: 'line', color: '#d97706', position: 'bottom', size: 'large' },
  },
  {
    id: 'arrow',
    label: '紫色箭头',
    aliases: ['arrow', '箭头', '紫色箭头'],
    action: { type: 'create', objectType: 'arrow', color: '#7c3aed', position: 'right', size: 'medium' },
  },
  {
    id: 'text',
    label: '文字 VoiceCanvas',
    aliases: ['text', '文字', 'voicecanvas'],
    action: {
      type: 'create',
      objectType: 'text',
      color: '#111827',
      position: 'center',
      size: 'small',
      text: 'VoiceCanvas',
    },
  },
  {
    id: 'clear',
    label: '清空画布',
    aliases: ['clear', '清空', '清空画布'],
    action: { type: 'clear' },
  },
];

export function resolveDevelopmentAction(input: string): DrawAction | null {
  const normalizedInput = input.trim().toLowerCase();

  if (!normalizedInput) {
    return null;
  }

  const preset = DEVELOPMENT_ACTION_PRESETS.find(
    (candidate) =>
      candidate.id === normalizedInput ||
      candidate.label.toLowerCase() === normalizedInput ||
      candidate.aliases.some((alias) => alias.toLowerCase() === normalizedInput),
  );

  return preset?.action ?? null;
}

export function formatDrawAction(action: DrawAction): string {
  switch (action.type) {
    case 'create':
      return action.objectType === 'text'
        ? `创建 text：${action.text ?? 'Text'}`
        : `创建 ${action.objectType}`;
    case 'update':
      return '更新最近对象';
    case 'delete':
      return '删除最近对象';
    case 'clear':
      return '清空画布';
  }
}
