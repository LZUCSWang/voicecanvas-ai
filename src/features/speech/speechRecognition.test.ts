import { describe, expect, it, vi } from 'vitest';
import { parseLocalCommand } from '../commands/localCommandParser';
import {
  buildSpeechCommandFeedback,
  createSpeechRecognitionError,
  detectSpeechRecognitionSupport,
  extractFinalTranscript,
  getSpeechControlState,
  getNextSpeechStatus,
} from './speechRecognition';

describe('speech recognition helpers', () => {
  it('detects standard and webkit SpeechRecognition support', () => {
    function MockSpeechRecognition() {
      return {};
    }

    expect(detectSpeechRecognitionSupport({ SpeechRecognition: MockSpeechRecognition })).toMatchObject({
      isSupported: true,
      RecognitionConstructor: MockSpeechRecognition,
    });

    expect(detectSpeechRecognitionSupport({ webkitSpeechRecognition: MockSpeechRecognition })).toMatchObject({
      isSupported: true,
      RecognitionConstructor: MockSpeechRecognition,
    });

    expect(detectSpeechRecognitionSupport({})).toMatchObject({
      isSupported: false,
      RecognitionConstructor: null,
      message: '当前浏览器不支持 Web Speech API，请使用 Chrome 打开。',
    });
  });

  it('maps speech recognition events into deterministic statuses', () => {
    expect(getNextSpeechStatus('idle', 'start')).toBe('listening');
    expect(getNextSpeechStatus('listening', 'result')).toBe('processing');
    expect(getNextSpeechStatus('processing', 'processed')).toBe('idle');
    expect(getNextSpeechStatus('listening', 'error')).toBe('error');
    expect(getNextSpeechStatus('error', 'reset')).toBe('idle');
  });

  it('derives deterministic voice control button state from support and status', () => {
    expect(getSpeechControlState({ isSupported: false, status: 'idle' })).toEqual({
      startDisabled: true,
      stopDisabled: true,
      startLabel: '开始监听',
      hintText: '当前浏览器不支持 Web Speech API，请使用 Chrome 打开。',
    });

    expect(getSpeechControlState({ isSupported: true, status: 'listening' })).toEqual({
      startDisabled: true,
      stopDisabled: false,
      startLabel: '正在监听',
      hintText: '正在监听，请说出绘图指令。',
    });

    expect(getSpeechControlState({ isSupported: true, status: 'processing' })).toEqual({
      startDisabled: true,
      stopDisabled: true,
      startLabel: '正在处理',
      hintText: '正在解析语音指令并生成画面。',
    });
  });

  it('maps unsupported, permission, and empty transcript errors to user-facing copy', () => {
    expect(createSpeechRecognitionError('not-supported')).toMatchObject({
      status: 'error',
      message: '当前浏览器不支持 Web Speech API，请使用 Chrome 打开。',
      feedbackText: '当前浏览器不支持语音识别，请使用 Chrome 打开。',
    });

    expect(createSpeechRecognitionError('not-allowed')).toMatchObject({
      status: 'error',
      message: '麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试。',
      feedbackText: '麦克风权限被拒绝，请允许麦克风后重试。',
    });

    expect(createSpeechRecognitionError('empty-transcript')).toMatchObject({
      status: 'error',
      message: '没有识别到语音文本，请再说一次。',
      feedbackText: '没有听懂，请换一种说法。',
    });
  });

  it('extracts the final transcript from a speech recognition result event', () => {
    const event = {
      results: [
        [{ transcript: '临时内容' }],
        [{ transcript: '  画一个登录流程图  ' }],
      ],
      resultIndex: 1,
    };

    expect(extractFinalTranscript(event)).toBe('画一个登录流程图');
  });

  it('builds spoken feedback for basic shapes, scene templates, clear, and failures', () => {
    expect(buildSpeechCommandFeedback(parseLocalCommand('画一个红色圆形'), '画一个红色圆形')).toMatchObject({
      ok: true,
      statusText: '语音识别：画一个红色圆形。本地解析(local)：创建圆形。',
      feedbackText: '已画圆形',
    });

    expect(buildSpeechCommandFeedback(parseLocalCommand('画一个登录流程图'), '画一个登录流程图')).toMatchObject({
      ok: true,
      statusText: '语音识别：画一个登录流程图。本地解析(local)：生成登录流程图。',
      feedbackText: '已生成流程图',
    });

    expect(buildSpeechCommandFeedback(parseLocalCommand('做一个本地解析和云端解析的对比图'), '做一个本地解析和云端解析的对比图')).toMatchObject({
      ok: true,
      statusText: '语音识别：做一个本地解析和云端解析的对比图。本地解析(local)：生成对比图。',
      feedbackText: '已生成对比图',
    });

    expect(buildSpeechCommandFeedback(parseLocalCommand('清空画布'), '清空画布')).toMatchObject({
      ok: true,
      feedbackText: '已清空画布',
    });

    expect(buildSpeechCommandFeedback(parseLocalCommand('帮我做一个会动的3D动画'), '帮我做一个会动的3D动画')).toMatchObject({
      ok: false,
      statusText: '语音识别：帮我做一个会动的3D动画。本地解析失败：暂未识别本地命令：“帮我做一个会动的3D动画”。',
      feedbackText: '没有听懂，请换一种说法。',
    });
  });

  it('speaks feedback only when SpeechSynthesis is available', () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    const speech = {
      SpeechSynthesisUtterance: vi.fn((text: string) => ({ text })),
      speechSynthesis: { cancel, speak },
    };

    const { speakFeedback } = buildSpeechCommandFeedback(parseLocalCommand('画一个红色圆形'), '画一个红色圆形');

    speakFeedback(speech);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speech.SpeechSynthesisUtterance).toHaveBeenCalledWith('已画圆形');
    expect(speak).toHaveBeenCalledWith({ text: '已画圆形' });
  });
});
