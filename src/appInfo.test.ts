import { describe, expect, it } from 'vitest';
import { appInfo } from './appInfo';

describe('appInfo', () => {
  it('describes edit history and export features', () => {
    expect(appInfo.name).toBe('VoiceCanvas AI');
    expect(appInfo.status).toBe('demo');
    expect(appInfo.availableFeatures).toEqual([
      'SVG drawing canvas',
      'Status and history panels',
      'Development action presets',
      'Structured scene templates',
      'Local Chinese command parsing',
      'Web Speech voice control',
      'Speech synthesis feedback',
      'Targeted fine-grained canvas editing',
      'AI-first contextual command parsing',
      'Client-side AI response validation',
      'Undo redo clear delete history',
      'PNG export with SVG fallback',
    ]);
  });
});
