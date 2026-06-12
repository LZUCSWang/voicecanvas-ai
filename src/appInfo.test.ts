import { describe, expect, it } from 'vitest';
import { appInfo } from './appInfo';

describe('appInfo', () => {
  it('describes the SVG canvas UI without claiming voice or export features', () => {
    expect(appInfo.name).toBe('VoiceCanvas AI');
    expect(appInfo.status).toBe('svg-canvas-ui');
    expect(appInfo.availableFeatures).toEqual([
      'SVG drawing canvas',
      'Status and history panels',
      'Development action presets',
    ]);
  });
});
