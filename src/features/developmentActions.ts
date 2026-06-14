import type { DrawAction, DrawingHistoryAction } from '../domain/drawingTypes';
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
  actions: DrawingHistoryAction[];
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
    label: '完整语音绘图流程',
    aliases: ['flowchart', 'flow chart', '流程图', '三步流程图'],
    actions: withClear(
      createSceneTemplateActions({
        type: 'flowchart',
        title: '完整语音绘图流程',
        items: ['语音输入', '本地规则解析', 'ModelScope 上下文解析', 'Action 安全校验', 'SVG 画布渲染', 'PNG 导出'],
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
        title: '语音绘图能力',
        items: ['基础图元', '结构模板', '上下文微调', '历史回退', '导出交付'],
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
        title: '本地解析 vs 云端 AI',
        items: ['本地规则离线解析', '云端 AI 上下文解析', '低延迟可靠命令', '复杂语义生成场景', '撤销重做可追溯', 'PNG 导出可提交'],
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
        title: 'VoiceCanvas 完整链路',
        items: ['语音识别', '新指令打断旧请求', '当前画布上下文', 'ModelScope 解析', 'Action 安全执行'],
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
        title: 'VoiceCanvas Demo',
        items: ['说出需求', '生成结构图', '微调并导出'],
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

export function formatDrawAction(action: DrawingHistoryAction): string {
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
    case 'undo':
      return '撤销上一步';
    case 'redo':
      return '重做上一步';
    case 'export':
      return action.format === 'svg' ? '导出 SVG' : '导出 PNG';
  }
}

export function formatDrawActions(actions: DrawingHistoryAction[]): string {
  if (actions.length === 1) {
    return formatDrawAction(actions[0]);
  }

  const createdCount = actions.filter((action) => action.type === 'create').length;
  return `生成结构化场景（${createdCount} 个对象）`;
}

function withClear(actions: DrawAction[]): DrawAction[] {
  return [{ type: 'clear' }, ...actions];
}
