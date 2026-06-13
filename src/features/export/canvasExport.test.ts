import { describe, expect, it } from 'vitest';
import { createCanvasExportFileName, ensureSvgDownloadMarkup } from './canvasExport';

describe('canvas export helpers', () => {
  it('creates stable timestamped file names for PNG and SVG downloads', () => {
    const now = new Date('2026-06-13T08:30:45.000Z');

    expect(createCanvasExportFileName('png', now)).toBe('voicecanvas-ai-2026-06-13-083045.png');
    expect(createCanvasExportFileName('svg', now)).toBe('voicecanvas-ai-2026-06-13-083045.svg');
  });

  it('adds SVG namespace metadata before downloading markup', () => {
    expect(ensureSvgDownloadMarkup('<svg viewBox="0 0 800 500"><rect width="800" height="500"/></svg>')).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><rect width="800" height="500"/></svg>',
    );
  });
});
