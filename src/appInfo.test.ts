import { describe, expect, it } from 'vitest';
import { appInfo } from './appInfo';

describe('appInfo', () => {
  it('describes scene templates without claiming voice or export features', () => {
    expect(appInfo.name).toBe('VoiceCanvas AI');
    expect(appInfo.status).toBe('scene-templates');
    expect(appInfo.availableFeatures).toEqual([
      'SVG drawing canvas',
      'Status and history panels',
      'Development action presets',
      'Structured scene templates',
    ]);
  });
});
