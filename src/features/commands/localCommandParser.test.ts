import { describe, expect, it } from 'vitest';
import { executeDrawingAction } from '../../domain/drawingExecutor';
import { createInitialDrawingState } from '../../domain/drawingState';
import type { DrawAction } from '../../domain/drawingTypes';
import { normalizeCommandText, parseLocalCommand } from './localCommandParser';

function getTextValues(actions: DrawAction[]) {
  return actions.flatMap((action) => {
    if (action.type === 'create' && action.objectType === 'text' && action.text) {
      return [action.text];
    }

    return [];
  });
}

describe('local Chinese command parser', () => {
  it('normalizes common Chinese synonyms and recognition mistakes', () => {
    expect(normalizeCommandText('园形 圆 圈圈 长方形 方块 巨型 车消 回退 擦掉全部 保存 下载图片')).toBe(
      '圆形 圆形 圆形 矩形 矩形 矩形 撤销 撤销 清空 导出 导出',
    );
  });

  it('parses basic shape, text, color, position, and size commands', () => {
    expect(parseLocalCommand('画一个红色圆形')).toMatchObject({
      ok: true,
      source: 'local',
      actions: [{ type: 'create', objectType: 'circle', color: '#ef4444', position: 'center', size: 'medium' }],
    });

    expect(parseLocalCommand('在左上角画一个蓝色矩形')).toMatchObject({
      ok: true,
      actions: [{ type: 'create', objectType: 'rectangle', color: '#2563eb', position: 'top-left', size: 'medium' }],
    });

    expect(parseLocalCommand('写文字你好')).toMatchObject({
      ok: true,
      actions: [{ type: 'create', objectType: 'text', text: '你好', position: 'center', size: 'small' }],
    });

    expect(parseLocalCommand('画一个大的紫色圆形')).toMatchObject({
      ok: true,
      actions: [{ type: 'create', objectType: 'circle', color: '#7c3aed', size: 'large' }],
    });

    expect(parseLocalCommand('画一个小的绿色圆形')).toMatchObject({
      ok: true,
      actions: [{ type: 'create', objectType: 'circle', color: '#16a34a', size: 'small' }],
    });

    expect(parseLocalCommand('画一个中号黑色矩形')).toMatchObject({
      ok: true,
      actions: [{ type: 'create', objectType: 'rectangle', color: '#111827', size: 'medium' }],
    });
  });

  it('parses relative size update commands', () => {
    expect(parseLocalCommand('变大一点')).toMatchObject({
      ok: true,
      actions: [{ type: 'update', changes: { size: 'large' } }],
      reason: '放大最近对象',
    });

    expect(parseLocalCommand('变小一点')).toMatchObject({
      ok: true,
      actions: [{ type: 'update', changes: { size: 'small' } }],
      reason: '缩小最近对象',
    });
  });

  it('parses clear commands', () => {
    expect(parseLocalCommand('擦掉全部')).toMatchObject({
      ok: true,
      source: 'local',
      actions: [{ type: 'clear' }],
      reason: '清空画布',
    });
  });

  it.each([
    ['生成三步流程图', '三步流程图'],
    ['画一个登录流程图', '登录流程图'],
    ['做一个本地解析和云端解析的对比图', '本地解析 vs 云端解析'],
    ['画 VoiceCanvas 项目架构图', 'VoiceCanvas 项目架构'],
    ['围绕语音绘图做思维导图', '语音绘图'],
    ['做一张发布会小海报', '发布会小海报'],
  ])('parses scene command: %s', (command, expectedTitle) => {
    const result = parseLocalCommand(command);

    expect(result.ok).toBe(true);
    expect(result.actions[0]).toEqual({ type: 'clear' });
    expect(result.actions.length).toBeGreaterThan(6);
    expect(getTextValues(result.actions)).toContain(expectedTitle);
  });

  it('splits connector words into multiple local actions', () => {
    const result = parseLocalCommand('画一个登录流程图，然后在右下角写 VoiceCanvas');

    expect(result.ok).toBe(true);
    expect(result.actions[0]).toEqual({ type: 'clear' });
    expect(result.actions.at(-1)).toMatchObject({
      type: 'create',
      objectType: 'text',
      text: 'VoiceCanvas',
      position: 'bottom-right',
    });

    const state = result.actions.reduce(executeDrawingAction, createInitialDrawingState());

    expect(state.objects.length).toBeGreaterThan(6);
    expect(state.objects.some((object) => object.type === 'text' && object.text === 'VoiceCanvas')).toBe(true);
  });

  it('returns a structured failure with source, error, and reason', () => {
    expect(parseLocalCommand('帮我做一个会动的3D动画')).toMatchObject({
      ok: false,
      source: 'local',
      actions: [],
      reason: '未匹配到本地规则',
    });

    expect(parseLocalCommand('保存')).toMatchObject({
      ok: false,
      source: 'local',
      actions: [],
      reason: '当前版本尚未接入导出动作',
    });
  });
});
