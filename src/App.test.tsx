import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('opens directly on the drawing workspace with status and history panels', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('VoiceCanvas AI');
    expect(markup).toContain('系统状态');
    expect(markup).toContain('最近识别文本');
    expect(markup).toContain('执行动作历史');
    expect(markup).toContain('开发辅助');
    expect(markup).toContain('语音识别未接入');
    expect(markup).toContain('输入预置 action 或 scene，例如 circle、flowchart 或 clear');
    expect(markup).toContain('aria-label="绘图画布区域"');
    expect(markup).toContain('flowchart');
    expect(markup).toContain('mind-map');
    expect(markup).toContain('comparison');
    expect(markup).toContain('architecture');
    expect(markup).toContain('poster');
  });
});
