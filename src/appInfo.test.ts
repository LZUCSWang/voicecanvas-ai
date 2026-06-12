import { describe, expect, it } from 'vitest';
import { appInfo } from './appInfo';

describe('appInfo', () => {
  it('describes the scaffold without claiming drawing or voice features', () => {
    expect(appInfo.name).toBe('VoiceCanvas AI');
    expect(appInfo.status).toBe('project-scaffold');
    expect(appInfo.availableFeatures).toEqual(['React app shell', 'Vitest baseline']);
  });
});
