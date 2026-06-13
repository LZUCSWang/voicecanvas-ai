import type { DrawAction } from '../domain/drawingTypes';
import { parseLocalCommand } from './commands/localCommandParser';
import { createSceneTemplateActions } from './scenes/sceneTemplates';

export interface DevelopmentActionPreset {
  id: string;
  label: string;
  aliases: string[];
  actions: DrawAction[];
}

export type DevelopmentCommandSource = 'local' | 'preset';

export interface DevelopmentCommandResolution {
  ok: boolean;
  source: DevelopmentCommandSource;
  actions: DrawAction[];
  statusText: string;
  recentText: string;
  error?: string;
}

export const DEVELOPMENT_ACTION_PRESETS: DevelopmentActionPreset[] = [
  {
    id: 'circle',
    label: '红色圆形',
    aliases: ['circle', '圆形', '红色圆形'],
    actions: [{ type: 'create', objectType: 'circle', color: '#ef4444', position: 'center', size: 'medium' }],
  },
  {
    id: 'rectangle',
    label: '蓝色矩形',
    aliases: ['rectangle', 'rect', '矩形', '蓝色矩形'],
    actions: [{ type: 'create', objectType: 'rectangle', color: '#2563eb', position: 'left', size: 'medium' }],
  },
  {
    id: 'triangle',
    label: '绿色三角形',
    aliases: ['triangle', '三角形', '绿色三角形'],
    actions: [{ type: 'create', objectType: 'triangle', color: '#16a34a', position: 'top', size: 'medium' }],
  },
  {
    id: 'line',
    label: '黄色直线',
    aliases: ['line', '直线', '线条', '黄色直线'],
    actions: [{ type: 'create', objectType: 'line', color: '#d97706', position: 'bottom', size: 'large' }],
  },
  {
    id: 'arrow',
    label: '紫色箭头',
    aliases: ['arrow', '箭头', '紫色箭头'],
    actions: [{ type: 'create', objectType: 'arrow', color: '#7c3aed', position: 'right', size: 'medium' }],
  },
  {
    id: 'text',
    label: '文字 VoiceCanvas',
    aliases: ['text', '文字', 'voicecanvas'],
    actions: [
      {
        type: 'create',
        objectType: 'text',
        color: '#111827',
        position: 'center',
        size: 'small',
        text: 'VoiceCanvas',
      },
    ],
  },
  {
    id: 'flowchart',
    label: '三步演示流程图',
    aliases: ['flowchart', 'flow chart', '流程图', '三步流程图'],
    actions: withClear(
      createSceneTemplateActions({
        type: 'flowchart',
        title: '三步演示流程',
        items: ['语音输入', '解析意图', '生成画面'],
      }),
    ),
  },
  {
    id: 'mind-map',
    label: '语音绘图思维导图',
    aliases: ['mind-map', 'mindmap', 'mind map', '思维导图', '脑图'],
    actions: withClear(
      createSceneTemplateActions({
        type: 'mind-map',
        title: '语音绘图',
        items: ['识别文本', '基础图元', '结构模板', 'SVG 画布'],
      }),
    ),
  },
  {
    id: 'comparison',
    label: '本地与云端对比图',
    aliases: ['comparison', 'compare', '对比图', '比较图'],
    actions: withClear(
      createSceneTemplateActions({
        type: 'comparison',
        title: '本地解析 vs 云端解析',
        items: ['本地解析', '云端兜底', '低延迟', '复杂理解'],
      }),
    ),
  },
  {
    id: 'architecture',
    label: 'VoiceCanvas 架构图',
    aliases: ['architecture', 'arch', '架构图', '系统架构'],
    actions: withClear(
      createSceneTemplateActions({
        type: 'architecture',
        title: 'VoiceCanvas 架构',
        items: ['语音输入', '本地解析', '场景模板', 'SVG 画布'],
      }),
    ),
  },
  {
    id: 'poster',
    label: '发布演示小海报',
    aliases: ['poster', '海报', '小海报'],
    actions: withClear(
      createSceneTemplateActions({
        type: 'poster',
        title: 'VoiceCanvas 发布',
        items: ['说出想法', '生成画面', '准备 Demo'],
      }),
    ),
  },
  {
    id: 'clear',
    label: '清空画布',
    aliases: ['clear', '清空', '清空画布'],
    actions: [{ type: 'clear' }],
  },
];

export function resolveDevelopmentAction(input: string): DrawAction | null {
  const actions = resolveDevelopmentActions(input);

  if (!actions || actions.length !== 1) {
    return null;
  }

  return actions[0];
}

export function resolveDevelopmentActions(input: string): DrawAction[] | null {
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

  return preset?.actions ?? null;
}

export function resolveDevelopmentCommand(input: string): DevelopmentCommandResolution {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return {
      ok: false,
      source: 'local',
      actions: [],
      statusText: '开发辅助输入为空。',
      recentText: '开发辅助输入为空',
      error: '请输入开发辅助命令。',
    };
  }

  const localResult = parseLocalCommand(trimmedInput);

  if (localResult.ok) {
    return {
      ok: true,
      source: 'local',
      actions: localResult.actions,
      statusText: `本地解析(local)：${localResult.reason}，${formatDrawActions(localResult.actions)}`,
      recentText: `开发辅助输入：${trimmedInput}`,
    };
  }

  const presetActions = resolveDevelopmentActions(trimmedInput);

  if (presetActions) {
    return {
      ok: true,
      source: 'preset',
      actions: presetActions,
      statusText: `已执行开发辅助 action：${formatDrawActions(presetActions)}`,
      recentText: `开发辅助输入：${trimmedInput}`,
    };
  }

  return {
    ok: false,
    source: 'local',
    actions: [],
    statusText: localResult.error,
    recentText: `开发辅助输入：${trimmedInput}`,
    error: localResult.error,
  };
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

export function formatDrawActions(actions: DrawAction[]): string {
  if (actions.length === 1) {
    return formatDrawAction(actions[0]);
  }

  const createdCount = actions.filter((action) => action.type === 'create').length;
  return `生成结构化场景（${createdCount} 个对象）`;
}

function withClear(actions: DrawAction[]): DrawAction[] {
  return [{ type: 'clear' }, ...actions];
}
