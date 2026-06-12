import { type FormEvent, useState } from 'react';
import { appInfo } from './appInfo';
import { Canvas } from './components/Canvas';
import { executeDrawingAction } from './domain/drawingExecutor';
import { createInitialDrawingState } from './domain/drawingState';
import type { DrawAction, DrawingState } from './domain/drawingTypes';
import {
  DEVELOPMENT_ACTION_PRESETS,
  formatDrawAction,
  resolveDevelopmentAction,
} from './features/developmentActions';

interface ActionHistoryItem {
  id: string;
  source: '预置示例' | '开发辅助';
  label: string;
}

const DEMO_ACTIONS: DrawAction[] = [
  { type: 'create', objectType: 'circle', color: '#ef4444', position: 'top-left', size: 'small' },
  { type: 'create', objectType: 'rectangle', color: '#2563eb', position: 'top-right', size: 'medium' },
  { type: 'create', objectType: 'triangle', color: '#16a34a', position: 'bottom-left', size: 'medium' },
  { type: 'create', objectType: 'line', color: '#d97706', position: 'bottom', size: 'small' },
  { type: 'create', objectType: 'arrow', color: '#7c3aed', position: 'right', size: 'medium' },
  {
    type: 'create',
    objectType: 'text',
    color: '#111827',
    position: 'center',
    size: 'small',
    text: 'VoiceCanvas',
  },
];

function createDemoDrawingState(): DrawingState {
  return DEMO_ACTIONS.reduce(executeDrawingAction, createInitialDrawingState());
}

function createInitialActionHistory(): ActionHistoryItem[] {
  return DEMO_ACTIONS.map((action, index) => ({
    id: `demo-${index}`,
    source: '预置示例' as const,
    label: formatDrawAction(action),
  })).reverse();
}

export function App() {
  const [drawingState, setDrawingState] = useState(createDemoDrawingState);
  const [helperInput, setHelperInput] = useState('');
  const [systemStatus, setSystemStatus] = useState('SVG 画布已就绪，语音识别未接入。');
  const [recentText, setRecentText] = useState('尚无真实语音识别文本');
  const [actionHistory, setActionHistory] = useState(createInitialActionHistory);

  function executeDevelopmentAction(action: DrawAction, sourceText: string) {
    setDrawingState((currentState) => executeDrawingAction(currentState, action));
    setRecentText(`开发辅助输入：${sourceText}`);
    setSystemStatus(`已执行开发辅助 action：${formatDrawAction(action)}`);
    setActionHistory((currentHistory) => [
      {
        id: `dev-${currentHistory.length}-${Date.now()}`,
        source: '开发辅助',
        label: formatDrawAction(action),
      },
      ...currentHistory,
    ]);
  }

  function handleDevelopmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const action = resolveDevelopmentAction(helperInput);

    if (!action) {
      setRecentText(helperInput ? `开发辅助输入：${helperInput}` : '开发辅助输入为空');
      setSystemStatus('未匹配到开发预置 action。');
      return;
    }

    executeDevelopmentAction(action, helperInput.trim());
    setHelperInput('');
  }

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="VoiceCanvas 绘图工作台">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">SVG drawing workspace</p>
            <h1>{appInfo.name}</h1>
          </div>
          <div className="status-pill" aria-label="当前版本状态">
            <span>系统状态</span>
            <strong>{appInfo.status}</strong>
          </div>
        </header>

        <div className="workspace-grid">
          <section className="canvas-panel" aria-label="绘图画布区域">
            <Canvas state={drawingState} />
          </section>

          <aside className="side-panel" aria-label="绘图状态面板">
            <section className="tool-panel" aria-labelledby="system-status-heading">
              <div className="panel-heading">
                <span className="label">Status</span>
                <h2 id="system-status-heading">系统状态</h2>
              </div>
              <p className="panel-value">{systemStatus}</p>
            </section>

            <section className="tool-panel" aria-labelledby="recent-text-heading">
              <div className="panel-heading">
                <span className="label">Transcript</span>
                <h2 id="recent-text-heading">最近识别文本</h2>
              </div>
              <p className="panel-value transcript">{recentText}</p>
            </section>

            <section className="tool-panel history-panel" aria-labelledby="history-heading">
              <div className="panel-heading">
                <span className="label">History</span>
                <h2 id="history-heading">执行动作历史</h2>
              </div>
              <ol className="action-history">
                {actionHistory.map((item) => (
                  <li key={item.id}>
                    <span>{item.source}</span>
                    <strong>{item.label}</strong>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        </div>

        <section className="developer-panel" aria-label="开发辅助">
          <div>
            <span className="label">Development only</span>
            <h2>开发辅助</h2>
          </div>
          <form className="developer-form" onSubmit={handleDevelopmentSubmit}>
            <input
              type="text"
              value={helperInput}
              onChange={(event) => setHelperInput(event.target.value)}
              placeholder="输入预置 action，例如 circle、arrow 或 clear"
              aria-label="开发辅助 action 输入框"
            />
            <button type="submit">执行</button>
          </form>
          <div className="preset-list" aria-label="可用开发预置 action">
            {DEVELOPMENT_ACTION_PRESETS.map((preset) => (
              <button key={preset.id} type="button" onClick={() => setHelperInput(preset.id)}>
                {preset.id}
              </button>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
