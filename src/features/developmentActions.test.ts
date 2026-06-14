import { describe, expect, it } from 'vitest';
import {
  DEVELOPMENT_ACTION_PRESETS,
  formatDrawAction,
  resolveDevelopmentAction,
  resolveDevelopmentActions,
  resolveDevelopmentCommand,
} from './developmentActions';
import type { DrawingHistoryAction } from '../domain/drawingTypes';

function getTextValues(actions: DrawingHistoryAction[]) {
  return actions.flatMap((action) => {
    if (action.type === 'create' && action.objectType === 'text' && action.text) {
      return [action.text];
    }

    return [];
  });
}

function requireActions(actions: DrawingHistoryAction[] | null): DrawingHistoryAction[] {
  expect(actions).not.toBeNull();
  return actions ?? [];
}

describe('development action presets', () => {
  it('resolves typed helper input to a preset drawing action', () => {
    expect(resolveDevelopmentAction(' circle ')).toMatchObject({
      type: 'create',
      objectType: 'circle',
      color: '#ef4444',
      position: 'center',
      size: 'medium',
    });
    expect(resolveDevelopmentAction('箭头')).toMatchObject({
      type: 'create',
      objectType: 'arrow',
      color: '#7c3aed',
      position: 'right',
      size: 'medium',
    });
  });

  it('keeps the helper intentionally limited to known presets', () => {
    expect(DEVELOPMENT_ACTION_PRESETS.map((preset) => preset.id)).toEqual([
      'circle',
      'rectangle',
      'triangle',
      'line',
      'arrow',
      'text',
      'flowchart',
      'mind-map',
      'comparison',
      'architecture',
      'poster',
      'clear',
    ]);
    expect(resolveDevelopmentAction('export')).toBeNull();
    expect(resolveDevelopmentAction('modelscope')).toBeNull();
  });

  it('resolves scene presets to multiple drawing actions while keeping basic presets available', () => {
    const flowchartActions = resolveDevelopmentActions('flowchart');
    const mindMapActions = resolveDevelopmentActions('思维导图');
    const circleActions = resolveDevelopmentActions('circle');

    expect(flowchartActions?.length).toBeGreaterThan(6);
    expect(flowchartActions?.[0]).toEqual({ type: 'clear' });
    expect(flowchartActions).toContainEqual(
      expect.objectContaining({ type: 'create', objectType: 'text', text: '完整语音绘图流程' }),
    );
    expect(mindMapActions?.some((action) => action.type === 'create' && action.objectType === 'circle')).toBe(true);
    expect(circleActions).toEqual([
      { type: 'create', objectType: 'circle', color: '#ef4444', position: 'center', size: 'medium' },
    ]);
  });

  it('uses complete demo copy for every structured scene preset', () => {
    expect(getTextValues(requireActions(resolveDevelopmentActions('flowchart')))).toEqual(
      expect.arrayContaining([
        '完整语音绘图流程',
        '语音输入',
        '本地规则解析',
        'ModelScope 上下文解析',
        'Action 安全校验',
        'SVG 画布渲染',
        'PNG 导出',
      ]),
    );

    expect(getTextValues(requireActions(resolveDevelopmentActions('comparison')))).toEqual(
      expect.arrayContaining([
        '本地解析 vs 云端 AI',
        '本地规则离线解析',
        '云端 AI 上下文解析',
        '低延迟可靠命令',
        '复杂语义生成场景',
        '撤销重做可追溯',
        'PNG 导出可提交',
      ]),
    );

    expect(getTextValues(requireActions(resolveDevelopmentActions('architecture')))).toEqual(
      expect.arrayContaining([
        'VoiceCanvas 完整链路',
        '语音识别',
        '新指令打断旧请求',
        '当前画布上下文',
        'ModelScope 解析',
        'Action 安全执行',
      ]),
    );

    expect(getTextValues(requireActions(resolveDevelopmentActions('mind-map')))).toEqual(
      expect.arrayContaining(['语音绘图能力', '基础图元', '结构模板', '上下文微调', '历史回退', '导出交付']),
    );

    expect(getTextValues(requireActions(resolveDevelopmentActions('poster')))).toEqual(
      expect.arrayContaining(['VoiceCanvas Demo', '说出需求', '生成结构图', '微调并导出']),
    );
  });

  it('routes Chinese helper input through the local parser before preset fallback', () => {
    const localResult = resolveDevelopmentCommand('画一个登录流程图，然后在右下角写 VoiceCanvas');

    expect(localResult).toMatchObject({
      ok: true,
      source: 'local',
      statusText: expect.stringContaining('本地解析'),
    });
    expect(localResult.actions[0]).toEqual({ type: 'clear' });
    expect(localResult.actions.at(-1)).toMatchObject({
      type: 'create',
      objectType: 'text',
      text: 'VoiceCanvas',
      position: 'bottom-right',
    });

    const presetResult = resolveDevelopmentCommand('flowchart');

    expect(presetResult).toMatchObject({
      ok: true,
      source: 'preset',
      statusText: expect.stringContaining('开发辅助 action'),
    });
    expect(presetResult.actions.length).toBeGreaterThan(6);
  });

  it('formats actions for a compact execution history', () => {
    expect(
      formatDrawAction({
        type: 'create',
        objectType: 'text',
        color: '#111827',
        position: 'center',
        size: 'small',
        text: 'VoiceCanvas',
      }),
    ).toBe('创建 text：VoiceCanvas');
    expect(formatDrawAction({ type: 'clear' })).toBe('清空画布');
  });
});
