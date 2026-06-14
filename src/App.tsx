import { type FormEvent, useCallback, useRef, useState } from 'react';
import { appInfo } from './appInfo';
import { Canvas } from './components/Canvas';
import { executeDrawingAction } from './domain/drawingExecutor';
import {
  createInitialDrawingHistoryState,
  executeDrawingHistoryActionsWithResults,
  type DrawingHistoryActionExecutionResult,
} from './domain/drawingHistory';
import { createInitialDrawingState } from './domain/drawingState';
import type { DrawAction, DrawingHistoryAction, DrawingHistoryState, DrawingState } from './domain/drawingTypes';
import {
  resolveCommandWithAiFallback,
  shouldUseAiParser,
  type CommandConversationItem,
  type CommandParseResolution,
} from './features/commands/aiCommandFallback';
import {
  createCommandPriorityController,
  STALE_COMMAND_MESSAGE,
  type CommandPriorityToken,
} from './features/commands/commandPriority';
import { parseLocalCommand } from './features/commands/localCommandParser';
import {
  DEVELOPMENT_ACTION_PRESETS,
  formatDrawAction,
  formatDrawActions,
  resolveDevelopmentActions,
} from './features/developmentActions';
import { exportCanvasAsImage } from './features/export/canvasExport';
import {
  getSpeechControlState,
  speakSpeechFeedback,
  type SpeechRecognitionStatus,
} from './features/speech/speechRecognition';
import { useSpeechRecognition } from './features/speech/useSpeechRecognition';

interface ActionHistoryItem {
  id: string;
  source: string;
  label: string;
}

interface CommandParseMeta {
  sourceLabel: string;
  elapsedLabel: string;
  resultLabel: string;
  errorText: string;
  contextLabel: string;
  actionLabel: string;
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

function createInitialCommandParseMeta(): CommandParseMeta {
  return {
    sourceLabel: '尚未解析',
    elapsedLabel: '-',
    resultLabel: '尚未解析',
    errorText: '',
    contextLabel: '尚未请求上下文',
    actionLabel: '-',
  };
}

function getTargetedExecutionFeedback(results: DrawingHistoryActionExecutionResult[]): string | null {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    const action = result.drawingResult?.action ?? result.action;

    if (action.type === 'update' || action.type === 'delete') {
      return result.drawingResult?.feedbackText ?? result.feedbackText;
    }
  }

  return null;
}

function getSingleEditFeedback(results: DrawingHistoryActionExecutionResult[]): string | null {
  if (results.length !== 1) {
    return null;
  }

  const [result] = results;

  if (result.action.type === 'clear' || result.action.type === 'undo' || result.action.type === 'redo') {
    return result.feedbackText;
  }

  return null;
}

function filterDrawActions(actions: DrawingHistoryAction[]): DrawAction[] {
  return actions.filter((action): action is DrawAction =>
    action.type === 'create' || action.type === 'update' || action.type === 'delete' || action.type === 'clear',
  );
}

async function getExportFeedback(
  results: DrawingHistoryActionExecutionResult[],
  svgElement: SVGSVGElement | null,
): Promise<string | null> {
  if (!results.some((result) => result.exportRequested)) {
    return null;
  }

  const result = await exportCanvasAsImage(svgElement);

  if (!result.ok) {
    return result.error ?? '导出失败，请稍后重试。';
  }

  if (result.format === 'png') {
    return `已导出 PNG：${result.fileName}`;
  }

  return `PNG 导出受浏览器限制，已改为 SVG：${result.fileName}`;
}

function createProcessingCommandParseMeta(text: string): CommandParseMeta {
  const localResult = parseLocalCommand(text);
  const willUseAi = shouldUseAiParser(text, localResult);

  return {
    sourceLabel: willUseAi ? 'ai / processing' : 'local / processing',
    elapsedLabel: '-',
    resultLabel: willUseAi ? 'AI 正在理解' : '本地解析中',
    errorText: '',
    contextLabel: willUseAi ? '准备携带 canvas / conversation / recentActions' : '本地预置不发送上下文',
    actionLabel: '-',
  };
}

function createCommandParseMeta(result: CommandParseResolution): CommandParseMeta {
  return {
    sourceLabel: result.fromCache ? `${result.source} / cache` : result.source,
    elapsedLabel: `${result.elapsedMs}ms`,
    resultLabel: result.sceneType ? `${result.sceneType} 场景` : result.actionSummary,
    errorText: result.ok ? '' : result.statusText,
    contextLabel: `canvas:${result.sentContext.canvas ? 'yes' : 'no'} / conversation:${result.sentContext.conversation ? 'yes' : 'no'} / recentActions:${result.sentContext.recentActions ? 'yes' : 'no'}`,
    actionLabel: result.actionSummary,
  };
}

function createPresetCommandParseMeta(label: string): CommandParseMeta {
  return {
    sourceLabel: 'preset',
    elapsedLabel: '0ms',
    resultLabel: label,
    errorText: '',
    contextLabel: '开发预置未请求 AI',
    actionLabel: label,
  };
}

function createConversationEntry(
  text: string,
  resolution: CommandParseResolution,
  feedback: string,
): CommandConversationItem {
  return {
    text,
    source: resolution.source,
    feedback,
    error: resolution.error,
    actionSummary: resolution.actionSummary,
    elapsedMs: resolution.elapsedMs,
    createdAt: new Date().toISOString(),
  };
}

function keepRecentActions(actions: DrawAction[]) {
  return actions.slice(-20);
}

export function App() {
  const canvasSvgRef = useRef<SVGSVGElement | null>(null);
  const [drawingHistory, setDrawingHistory] = useState<DrawingHistoryState>(() =>
    createInitialDrawingHistoryState(createDemoDrawingState()),
  );
  const drawingState = drawingHistory.present;
  const [helperInput, setHelperInput] = useState('');
  const [systemStatus, setSystemStatus] = useState('SVG 画布已就绪，请点击开始监听授权麦克风。');
  const [recentText, setRecentText] = useState('尚无语音识别文本');
  const [actionHistory, setActionHistory] = useState(createInitialActionHistory);
  const [commandParseMeta, setCommandParseMeta] = useState(createInitialCommandParseMeta);
  const [isCommandProcessing, setIsCommandProcessing] = useState(false);
  const [conversationLog, setConversationLog] = useState<CommandConversationItem[]>([]);
  const [recentExecutedActions, setRecentExecutedActions] = useState<DrawAction[]>(DEMO_ACTIONS);
  const [canvasRevision, setCanvasRevision] = useState(DEMO_ACTIONS.length);
  const [conversationRevision, setConversationRevision] = useState(0);
  const commandPriorityRef = useRef(createCommandPriorityController());

  const executeCommandText = useCallback(async (text: string, source: '语音输入' | '开发辅助', shouldSpeak: boolean) => {
    const trimmedText = text.trim();

    if (!trimmedText) {
      const emptyMessage = source === '语音输入' ? '没有识别到语音文本，请再说一次。' : '开发辅助输入为空。';
      setSystemStatus(emptyMessage);
      setCommandParseMeta({
        sourceLabel: 'local',
        elapsedLabel: '0ms',
        resultLabel: '未生成动作',
        errorText: emptyMessage,
        contextLabel: '未发送上下文',
        actionLabel: '-',
      });
      setIsCommandProcessing(false);
      return false;
    }

    const commandToken = commandPriorityRef.current.beginCommand();

    setRecentText(`${source}：${trimmedText}`);
    setIsCommandProcessing(true);
    setCommandParseMeta(createProcessingCommandParseMeta(trimmedText));
    setSystemStatus(commandToken.replacedPrevious ? STALE_COMMAND_MESSAGE : '正在解析指令，请稍候。');

    const currentConversation = conversationLog;
    const currentRecentActions = recentExecutedActions;
    const resolution = await resolveCommandWithAiFallback(trimmedText, {
      drawingState,
      conversation: currentConversation,
      recentActions: currentRecentActions,
      canvasRevision,
      conversationRevision,
      abortSignal: commandToken.signal,
    });

    if (commandPriorityRef.current.ignoreIfStale(commandToken)) {
      return false;
    }

    setCommandParseMeta(createCommandParseMeta(resolution));
    setIsCommandProcessing(false);

    if (!resolution.ok) {
      setSystemStatus(resolution.statusText);
      setConversationLog((currentLog) => [
        ...currentLog,
        createConversationEntry(trimmedText, resolution, resolution.feedbackText),
      ].slice(-10));
      setConversationRevision((currentRevision) => currentRevision + 1);

      if (shouldSpeak) {
        speakSpeechFeedback(resolution.feedbackText);
      }

      commandPriorityRef.current.finishCommand(commandToken);
      return false;
    }

    const execution = executeDrawingHistoryActionsWithResults(drawingHistory, resolution.actions);
    const targetedFeedback = getTargetedExecutionFeedback(execution.results);
    const singleEditFeedback = getSingleEditFeedback(execution.results);
    const exportFeedback = await getExportFeedback(execution.results, canvasSvgRef.current);

    if (commandPriorityRef.current.ignoreIfStale(commandToken)) {
      return false;
    }

    const finalFeedbackText = exportFeedback ?? targetedFeedback ?? singleEditFeedback ?? resolution.feedbackText;
    const drawActions = filterDrawActions(resolution.actions);

    setDrawingHistory(execution.history);
    if (execution.results.some((result) => result.changed)) {
      setCanvasRevision((currentRevision) => currentRevision + 1);
    }
    setSystemStatus(`${resolution.statusText} ${finalFeedbackText}`);
    if (drawActions.length > 0) {
      setRecentExecutedActions((currentActions) => keepRecentActions([...currentActions, ...drawActions]));
    }
    setConversationLog((currentLog) => [
      ...currentLog,
      createConversationEntry(trimmedText, resolution, finalFeedbackText),
    ].slice(-10));
    setConversationRevision((currentRevision) => currentRevision + 1);

    if (shouldSpeak) {
      speakSpeechFeedback(finalFeedbackText);
    }

    setActionHistory((currentHistory) => [
      {
        id: `${source}-${currentHistory.length}-${Date.now()}`,
        source: `${source}/${resolution.source}`,
        label: targetedFeedback ?? resolution.actionSummary,
      },
      ...currentHistory,
    ]);

    commandPriorityRef.current.finishCommand(commandToken);
    return true;
  }, [canvasRevision, conversationLog, conversationRevision, drawingHistory, drawingState, recentExecutedActions]);

  const executeVoiceCommand = useCallback(
    async (transcript: string) => {
      await executeCommandText(transcript, '语音输入', true);
    },
    [executeCommandText],
  );

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

  async function executeDevelopmentActions(
    actions: DrawingHistoryAction[],
    sourceText: string,
    statusText?: string,
    commandToken: CommandPriorityToken = commandPriorityRef.current.beginCommand(),
  ) {
    if (commandToken.replacedPrevious) {
      setSystemStatus(STALE_COMMAND_MESSAGE);
      setIsCommandProcessing(false);
    }

    const execution = executeDrawingHistoryActionsWithResults(drawingHistory, actions);
    const targetedFeedback = getTargetedExecutionFeedback(execution.results);
    const singleEditFeedback = getSingleEditFeedback(execution.results);
    const exportFeedback = await getExportFeedback(execution.results, canvasSvgRef.current);

    if (commandPriorityRef.current.ignoreIfStale(commandToken)) {
      return;
    }

    const resultLabel = exportFeedback ?? targetedFeedback ?? singleEditFeedback ?? statusText ?? formatDrawActions(actions);
    const drawActions = filterDrawActions(actions);

    setDrawingHistory(execution.history);
    if (execution.results.some((result) => result.changed)) {
      setCanvasRevision((currentRevision) => currentRevision + 1);
    }
    if (drawActions.length > 0) {
      setRecentExecutedActions((currentActions) => keepRecentActions([...currentActions, ...drawActions]));
    }
    setRecentText(`开发辅助输入：${sourceText}`);
    setSystemStatus(resultLabel);
    setCommandParseMeta(createPresetCommandParseMeta(resultLabel));
    setActionHistory((currentHistory) => [
      {
        id: `dev-${currentHistory.length}-${Date.now()}`,
        source: '开发辅助',
        label: targetedFeedback ?? formatDrawActions(actions),
      },
      ...currentHistory,
    ]);
    commandPriorityRef.current.finishCommand(commandToken);
  }

  async function handleDevelopmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedInput = helperInput.trim();

    if (!trimmedInput) {
      setRecentText('开发辅助输入为空');
      setSystemStatus('开发辅助输入为空。');
      setCommandParseMeta({
        sourceLabel: 'local',
        elapsedLabel: '0ms',
        resultLabel: '未生成动作',
        errorText: '请输入开发辅助命令。',
        contextLabel: '未发送上下文',
        actionLabel: '-',
      });
      return;
    }

    const presetActions = resolveDevelopmentActions(trimmedInput);

    if (presetActions) {
      const commandToken = commandPriorityRef.current.beginCommand();
      await executeDevelopmentActions(
        presetActions,
        trimmedInput,
        `已执行开发辅助 action：${formatDrawActions(presetActions)}`,
        commandToken,
      );
      setHelperInput('');
      return;
    }

    const executed = await executeCommandText(trimmedInput, '开发辅助', false);

    if (executed) {
      setHelperInput('');
    }
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
            <Canvas state={drawingState} svgRef={canvasSvgRef} />
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

            <section className="tool-panel edit-panel" aria-labelledby="edit-actions-heading">
              <div className="panel-heading">
                <span className="label">Edit</span>
                <h2 id="edit-actions-heading">编辑操作</h2>
              </div>
              <div className="edit-actions" aria-label="编辑操作">
                <button
                  type="button"
                  onClick={() => void executeDevelopmentActions([{ type: 'undo' }], '撤销', '撤销')}
                  disabled={drawingHistory.past.length === 0}
                >
                  撤销
                </button>
                <button
                  type="button"
                  onClick={() => void executeDevelopmentActions([{ type: 'redo' }], '重做', '重做')}
                  disabled={drawingHistory.future.length === 0}
                >
                  重做
                </button>
                <button type="button" onClick={() => void executeDevelopmentActions([{ type: 'clear' }], '清空画布', '清空画布')}>
                  清空
                </button>
                <button type="button" onClick={() => void executeDevelopmentActions([{ type: 'export', format: 'png' }], '导出图片', '导出 PNG')}>
                  导出 PNG
                </button>
              </div>
            </section>

            <section className="tool-panel" aria-labelledby="system-status-heading">
              <div className="panel-heading">
                <span className="label">Status</span>
                <h2 id="system-status-heading">系统状态</h2>
              </div>
              <p className="panel-value">{systemStatus}</p>
            </section>
          </aside>
        </div>

        <section className="info-grid" aria-label="解析与历史信息">
            <section className="tool-panel parse-panel" aria-labelledby="parse-status-heading" aria-busy={isCommandProcessing}>
              <div className="panel-heading">
                <span className="label">Parser</span>
                <h2 id="parse-status-heading">解析来源</h2>
              </div>
              <dl className="parse-meta">
                <div>
                  <dt>解析来源</dt>
                  <dd>{commandParseMeta.sourceLabel}</dd>
                </div>
                <div>
                  <dt>耗时</dt>
                  <dd>{commandParseMeta.elapsedLabel}</dd>
                </div>
                <div>
                  <dt>本次结果</dt>
                  <dd>{commandParseMeta.resultLabel}</dd>
                </div>
                <div>
                  <dt>上下文</dt>
                  <dd>{commandParseMeta.contextLabel}</dd>
                </div>
                <div>
                  <dt>动作摘要</dt>
                  <dd>{commandParseMeta.actionLabel}</dd>
                </div>
              </dl>
              {commandParseMeta.errorText && <p className="voice-error">{commandParseMeta.errorText}</p>}
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
        </section>

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
              placeholder="输入中文命令或预置 action，例如 画一个登录流程图、撤销、导出图片、circle 或 clear"
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
