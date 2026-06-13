import type { DrawingHistoryAction, DrawingObjectType } from '../../domain/drawingTypes';
import type { LocalCommandParseResult } from '../commands/localCommandParser';

export type SpeechRecognitionStatus = 'idle' | 'listening' | 'processing' | 'error';

export type SpeechRecognitionTransition = 'start' | 'result' | 'processed' | 'error' | 'reset' | 'stop';

export type SpeechRecognitionErrorReason =
  | 'not-supported'
  | 'not-allowed'
  | 'service-not-allowed'
  | 'audio-capture'
  | 'no-speech'
  | 'empty-transcript'
  | 'network'
  | 'aborted'
  | 'unknown';

export interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

export type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

export interface SpeechRecognitionGlobalLike {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
}

export interface SpeechRecognitionSupport {
  isSupported: boolean;
  RecognitionConstructor: SpeechRecognitionConstructor | null;
  message: string;
}

export interface SpeechRecognitionErrorState {
  status: 'error';
  reason: SpeechRecognitionErrorReason;
  message: string;
  feedbackText: string;
}

export interface SpeechRecognitionAlternativeLike {
  transcript?: string;
}

export interface SpeechRecognitionResultLike {
  [index: number]: SpeechRecognitionAlternativeLike | undefined;
}

export interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike | undefined;
}

export interface SpeechRecognitionResultEventLike {
  results: SpeechRecognitionResultListLike;
  resultIndex?: number;
}

export interface SpeechRecognitionErrorEventLike {
  error?: string;
}

export interface SpeechSynthesisUtteranceLike {
  text: string;
}

export interface SpeechSynthesisTarget {
  SpeechSynthesisUtterance?: new (text: string) => SpeechSynthesisUtteranceLike;
  speechSynthesis?: {
    cancel: () => void;
    speak: (utterance: SpeechSynthesisUtteranceLike) => void;
  };
}

export interface SpeechCommandFeedback {
  ok: boolean;
  actions: DrawingHistoryAction[];
  statusText: string;
  feedbackText: string;
  speakFeedback: (target?: SpeechSynthesisTarget) => boolean;
}

export interface SpeechControlState {
  startDisabled: boolean;
  stopDisabled: boolean;
  startLabel: string;
  hintText: string;
}

const UNSUPPORTED_MESSAGE = '当前浏览器不支持 Web Speech API，请使用 Chrome 打开。';
const UNSUPPORTED_FEEDBACK = '当前浏览器不支持语音识别，请使用 Chrome 打开。';
const PERMISSION_MESSAGE = '麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试。';
const PERMISSION_FEEDBACK = '麦克风权限被拒绝，请允许麦克风后重试。';
const EMPTY_TRANSCRIPT_MESSAGE = '没有识别到语音文本，请再说一次。';
const EMPTY_TRANSCRIPT_FEEDBACK = '没有听懂，请换一种说法。';

export function detectSpeechRecognitionSupport(globalLike?: SpeechRecognitionGlobalLike): SpeechRecognitionSupport {
  const candidate = globalLike?.SpeechRecognition ?? globalLike?.webkitSpeechRecognition ?? null;

  if (typeof candidate !== 'function') {
    return {
      isSupported: false,
      RecognitionConstructor: null,
      message: UNSUPPORTED_MESSAGE,
    };
  }

  return {
    isSupported: true,
    RecognitionConstructor: candidate as SpeechRecognitionConstructor,
    message: 'Web Speech API 可用。',
  };
}

export function getNextSpeechStatus(
  currentStatus: SpeechRecognitionStatus,
  transition: SpeechRecognitionTransition,
): SpeechRecognitionStatus {
  switch (transition) {
    case 'start':
      return 'listening';
    case 'result':
      return 'processing';
    case 'processed':
    case 'reset':
    case 'stop':
      return 'idle';
    case 'error':
      return 'error';
    default:
      return currentStatus;
  }
}

export function getSpeechControlState({
  isSupported,
  status,
}: {
  isSupported: boolean;
  status: SpeechRecognitionStatus;
}): SpeechControlState {
  if (!isSupported) {
    return {
      startDisabled: true,
      stopDisabled: true,
      startLabel: '开始监听',
      hintText: UNSUPPORTED_MESSAGE,
    };
  }

  if (status === 'listening') {
    return {
      startDisabled: true,
      stopDisabled: false,
      startLabel: '正在监听',
      hintText: '正在监听，请说出绘图指令。',
    };
  }

  if (status === 'processing') {
    return {
      startDisabled: true,
      stopDisabled: true,
      startLabel: '正在处理',
      hintText: '正在解析语音指令并生成画面。',
    };
  }

  return {
    startDisabled: false,
    stopDisabled: true,
    startLabel: '开始监听',
    hintText: status === 'error' ? '语音识别遇到问题，请按提示处理后重试。' : '点击开始监听后说出绘图指令。',
  };
}

export function createSpeechRecognitionError(reason: SpeechRecognitionErrorReason | string): SpeechRecognitionErrorState {
  switch (reason) {
    case 'not-supported':
      return errorState('not-supported', UNSUPPORTED_MESSAGE, UNSUPPORTED_FEEDBACK);
    case 'not-allowed':
    case 'service-not-allowed':
      return errorState('not-allowed', PERMISSION_MESSAGE, PERMISSION_FEEDBACK);
    case 'audio-capture':
      return errorState('audio-capture', '没有检测到可用麦克风，请检查设备后重试。', '没有检测到可用麦克风，请检查设备后重试。');
    case 'no-speech':
    case 'empty-transcript':
      return errorState('empty-transcript', EMPTY_TRANSCRIPT_MESSAGE, EMPTY_TRANSCRIPT_FEEDBACK);
    case 'network':
      return errorState('network', '语音识别服务暂时不可用，请稍后重试。', '语音识别暂时不可用，请稍后重试。');
    case 'aborted':
      return errorState('aborted', '语音监听已停止。', '语音监听已停止。');
    default:
      return errorState('unknown', '语音识别发生错误，请重试。', '语音识别发生错误，请重试。');
  }
}

export function extractFinalTranscript(event: SpeechRecognitionResultEventLike): string {
  const startIndex = Math.max(0, event.resultIndex ?? 0);
  const transcriptParts: string[] = [];

  for (let index = startIndex; index < event.results.length; index += 1) {
    const transcript = event.results[index]?.[0]?.transcript?.trim();

    if (transcript) {
      transcriptParts.push(transcript);
    }
  }

  return transcriptParts.join(' ').trim();
}

export function buildSpeechCommandFeedback(result: LocalCommandParseResult, transcript: string): SpeechCommandFeedback {
  if (!result.ok) {
    const feedbackText = EMPTY_TRANSCRIPT_FEEDBACK;

    return {
      ok: false,
      actions: [],
      statusText: `语音识别：${transcript}。本地解析失败：${result.error}`,
      feedbackText,
      speakFeedback: (target) => speakSpeechFeedback(feedbackText, target),
    };
  }

  const feedbackText = getSuccessFeedbackText(result.actions, result.reason);

  return {
    ok: true,
    actions: result.actions,
    statusText: `语音识别：${transcript}。本地解析(local)：${result.reason}。`,
    feedbackText,
    speakFeedback: (target) => speakSpeechFeedback(feedbackText, target),
  };
}

export function speakSpeechFeedback(text: string, target: SpeechSynthesisTarget | undefined = getDefaultSpeechSynthesisTarget()): boolean {
  if (!target?.speechSynthesis || !target.SpeechSynthesisUtterance) {
    return false;
  }

  const utterance = new target.SpeechSynthesisUtterance(text);
  target.speechSynthesis.cancel();
  target.speechSynthesis.speak(utterance);

  return true;
}

function getSuccessFeedbackText(actions: DrawingHistoryAction[], reason: string): string {
  if (reason.includes('流程图')) {
    return '已生成流程图';
  }

  if (reason.includes('对比图')) {
    return '已生成对比图';
  }

  if (reason.includes('架构图')) {
    return '已生成架构图';
  }

  if (reason.includes('思维导图')) {
    return '已生成思维导图';
  }

  if (reason.includes('海报')) {
    return '已生成海报';
  }

  if (actions.length === 1 && actions[0].type === 'clear') {
    return '已清空画布';
  }

  if (actions.length === 1 && actions[0].type === 'undo') {
    return '已撤销上一步';
  }

  if (actions.length === 1 && actions[0].type === 'redo') {
    return '已重做上一步';
  }

  if (actions.length === 1 && actions[0].type === 'export') {
    return '正在导出图片';
  }

  if (actions.length === 1 && actions[0].type === 'update') {
    return '已更新图形';
  }

  const createdObjectType = actions.find((action) => action.type === 'create')?.objectType;

  if (createdObjectType) {
    return `已画${formatSpokenObjectType(createdObjectType)}`;
  }

  return '已执行绘图指令';
}

function formatSpokenObjectType(objectType: DrawingObjectType): string {
  const labels: Record<DrawingObjectType, string> = {
    circle: '圆形',
    rectangle: '矩形',
    triangle: '三角形',
    line: '直线',
    arrow: '箭头',
    text: '文字',
  };

  return labels[objectType];
}

function errorState(reason: SpeechRecognitionErrorReason, message: string, feedbackText: string): SpeechRecognitionErrorState {
  return {
    status: 'error',
    reason,
    message,
    feedbackText,
  };
}

function getDefaultSpeechSynthesisTarget(): SpeechSynthesisTarget | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window as unknown as SpeechSynthesisTarget;
}
