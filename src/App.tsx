import { type FormEvent, useCallback, useState } from 'react';
import { appInfo } from './appInfo';
import { Canvas } from './components/Canvas';
import { executeDrawingAction, executeDrawingActionWithResult, type DrawingActionExecutionResult } from './domain/drawingExecutor';
import { createInitialDrawingState } from './domain/drawingState';
import type { DrawAction, DrawingState } from './domain/drawingTypes';
import { parseLocalCommand } from './features/commands/localCommandParser';
import {
  DEVELOPMENT_ACTION_PRESETS,
  formatDrawAction,
  formatDrawActions,
  resolveDevelopmentCommand,
} from './features/developmentActions';
import {
  buildSpeechCommandFeedback,
  getSpeechControlState,
  speakSpeechFeedback,
  type SpeechRecognitionStatus,
} from './features/speech/speechRecognition';
import { useSpeechRecognition } from './features/speech/useSpeechRecognition';

interface ActionHistoryItem {
  id: string;
  source: '预置示例' | '开发辅助' | '语音输入';
  label: string;
}

const SPEECH_STATUS_LABELS: SpeechRecognitionStatus[] = ['idle', 'listening', 'processing', 'error'];

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

function executeDrawingActionsWithResults(state: DrawingState, actions: DrawAction[]) {
  const results: DrawingActionExecutionResult[] = [];
  const nextState = actions.reduce((currentState, action) => {
    const actionResult = executeDrawingActionWithResult(currentState, action);
    results.push(actionResult);
    return actionResult.state;
  }, state);

  return {
    state: nextState,
    results,
  };
}

function getTargetedExecutionFeedback(results: DrawingActionExecutionResult[]): string | null {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];

    if (result.action.type === 'update' || result.action.type === 'delete') {
      return result.feedbackText;
    }
  }

  return null;
}

export function App() {
  const [drawingState, setDrawingState] = useState(createDemoDrawingState);
  const [helperInput, setHelperInput] = useState('');
  const [systemStatus, setSystemStatus] = useState('SVG 画布已就绪，请点击开始监听授权麦克风。');
  const [recentText, setRecentText] = useState('尚无语音识别文本');
  const [actionHistory, setActionHistory] = useState(createInitialActionHistory);

  const executeVoiceCommand = useCallback((transcript: string) => {
    const parseResult = parseLocalCommand(transcript);
    const feedback = buildSpeechCommandFeedback(parseResult, transcript);

    setRecentText(`语音识别：${transcript}`);

    if (!feedback.ok) {
      setSystemStatus(feedback.statusText);
      feedback.speakFeedback();
      return;
    }

    const execution = executeDrawingActionsWithResults(drawingState, feedback.actions);
    const targetedFeedback = getTargetedExecutionFeedback(execution.results);
    const finalFeedbackText = targetedFeedback ?? feedback.feedbackText;

    setDrawingState(execution.state);
    setSystemStatus(`${feedback.statusText} ${finalFeedbackText}`);
    speakSpeechFeedback(finalFeedbackText);
    setActionHistory((currentHistory) => [
      {
        id: `voice-${currentHistory.length}-${Date.now()}`,
        source: '语音输入',
        label: targetedFeedback ?? formatDrawActions(feedback.actions),
      },
      ...currentHistory,
    ]);
  }, [drawingState]);

  const {
    status: speechStatus,
    error: speechError,
    isSupported: isSpeechSupported,
    supportMessage,
    startListening,
    stopListening,
  } = useSpeechRecognition({
    onTranscript: executeVoiceCommand,
    onError: (nextError) => {
      setSystemStatus(nextError.message);
      speakSpeechFeedback(nextError.feedbackText);
    },
  });
  const speechControlState = getSpeechControlState({ isSupported: isSpeechSupported, status: speechStatus });

  function executeDevelopmentActions(actions: DrawAction[], sourceText: string, statusText?: string) {
    const execution = executeDrawingActionsWithResults(drawingState, actions);
    const targetedFeedback = getTargetedExecutionFeedback(execution.results);

    setDrawingState(execution.state);
    setRecentText(`开发辅助输入：${sourceText}`);
    setSystemStatus(targetedFeedback ?? statusText ?? `已执行开发辅助 action：${formatDrawActions(actions)}`);
    setActionHistory((currentHistory) => [
      {
        id: `dev-${currentHistory.length}-${Date.now()}`,
        source: '开发辅助',
        label: targetedFeedback ?? formatDrawActions(actions),
      },
      ...currentHistory,
    ]);
  }

  function handleDevelopmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const resolution = resolveDevelopmentCommand(helperInput);

    if (!resolution.ok) {
      setRecentText(resolution.recentText);
      setSystemStatus(resolution.statusText);
      return;
    }

    executeDevelopmentActions(resolution.actions, helperInput.trim(), resolution.statusText);
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
            <section className="tool-panel voice-panel" aria-labelledby="voice-control-heading">
              <div className="panel-heading">
                <span className="label">Voice</span>
                <h2 id="voice-control-heading">语音控制</h2>
              </div>
              <div className="speech-status-list" aria-label="语音识别状态">
                {SPEECH_STATUS_LABELS.map((status) => (
                  <span key={status} className={speechStatus === status ? 'active' : undefined} aria-current={speechStatus === status}>
                    {status}
                  </span>
                ))}
              </div>
              <div className="voice-actions">
                <button
                  type="button"
                  onClick={startListening}
                  disabled={speechControlState.startDisabled}
                >
                  {speechControlState.startLabel}
                </button>
                <button type="button" onClick={stopListening} disabled={speechControlState.stopDisabled}>
                  停止监听
                </button>
              </div>
              <p className="voice-hint">{speechControlState.hintText}</p>
              <p className="voice-help">浏览器可能会要求你点击一次开始按钮授权麦克风；后续绘图创作通过语音完成。</p>
              {!isSpeechSupported && <p className="voice-error">{supportMessage}</p>}
              {speechError && <p className="voice-error">{speechError.message}</p>}
            </section>

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
              placeholder="输入中文命令或预置 action，例如 画一个登录流程图、circle 或 clear"
              aria-label="开发辅助 action 输入框"
            />
            <button type="submit">执行</button>
          </form>
          <div className="preset-list" aria-label="可用开发预置 action">
            {DEVELOPMENT_ACTION_PRESETS.map((preset) => (
              <button key={preset.id} type="button" onClick={() => executeDevelopmentActions(preset.actions, preset.id)}>
                {preset.id}
              </button>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
