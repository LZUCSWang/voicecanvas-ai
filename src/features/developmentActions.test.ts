import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_ACTION_PRESETS, formatDrawAction, resolveDevelopmentAction } from './developmentActions';

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
      'clear',
    ]);
    expect(resolveDevelopmentAction('export')).toBeNull();
    expect(resolveDevelopmentAction('modelscope')).toBeNull();
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
