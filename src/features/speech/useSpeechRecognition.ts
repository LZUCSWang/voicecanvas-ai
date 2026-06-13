import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createSpeechRecognitionError,
  detectSpeechRecognitionSupport,
  extractFinalTranscript,
  getNextSpeechStatus,
  type BrowserSpeechRecognition,
  type SpeechRecognitionErrorEventLike,
  type SpeechRecognitionErrorState,
  type SpeechRecognitionGlobalLike,
  type SpeechRecognitionResultEventLike,
  type SpeechRecognitionStatus,
} from './speechRecognition';

export interface UseSpeechRecognitionOptions {
  lang?: string;
  onTranscript?: (transcript: string) => void | Promise<void>;
  onError?: (error: SpeechRecognitionErrorState) => void;
}

export interface UseSpeechRecognitionResult {
  status: SpeechRecognitionStatus;
  transcript: string;
  error: SpeechRecognitionErrorState | null;
  isSupported: boolean;
  supportMessage: string;
  startListening: () => void;
  stopListening: () => void;
  resetError: () => void;
}

export function useSpeechRecognition({
  lang = 'zh-CN',
  onTranscript,
  onError,
}: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionResult {
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const processingResetTimerRef = useRef<number | null>(null);
  const [status, setStatus] = useState<SpeechRecognitionStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<SpeechRecognitionErrorState | null>(null);

  const support = useMemo(() => detectSpeechRecognitionSupport(getBrowserSpeechRecognitionGlobal()), []);

  const clearProcessingResetTimer = useCallback(() => {
    if (processingResetTimerRef.current === null || typeof window === 'undefined') {
      return;
    }

    window.clearTimeout(processingResetTimerRef.current);
    processingResetTimerRef.current = null;
  }, []);

  const publishError = useCallback(
    (nextError: SpeechRecognitionErrorState) => {
      clearProcessingResetTimer();
      setError(nextError);
      setStatus(nextError.status);
      onError?.(nextError);
    },
    [clearProcessingResetTimer, onError],
  );

  const resetError = useCallback(() => {
    clearProcessingResetTimer();
    setError(null);
    setStatus((currentStatus) => getNextSpeechStatus(currentStatus, 'reset'));
  }, [clearProcessingResetTimer]);

  const startListening = useCallback(() => {
    clearProcessingResetTimer();

    if (!support.isSupported || !support.RecognitionConstructor) {
      publishError(createSpeechRecognitionError('not-supported'));
      return;
    }

    if (recognitionRef.current) {
      return;
    }

    const recognition = new support.RecognitionConstructor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setError(null);
      setStatus((currentStatus) => getNextSpeechStatus(currentStatus, 'start'));
    };

    recognition.onresult = (event: SpeechRecognitionResultEventLike) => {
      const finalTranscript = extractFinalTranscript(event);

      if (!finalTranscript) {
        publishError(createSpeechRecognitionError('empty-transcript'));
        return;
      }

      setTranscript(finalTranscript);
      setError(null);
      setStatus((currentStatus) => getNextSpeechStatus(currentStatus, 'result'));

      Promise.resolve(onTranscript?.(finalTranscript)).finally(() => {
        const finishProcessing = () => {
          processingResetTimerRef.current = null;
          setStatus((currentStatus) => (currentStatus === 'processing' ? getNextSpeechStatus(currentStatus, 'processed') : currentStatus));
        };

        if (typeof window === 'undefined') {
          finishProcessing();
          return;
        }

        processingResetTimerRef.current = window.setTimeout(finishProcessing, 350);
      });
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      publishError(createSpeechRecognitionError(event.error ?? 'unknown'));
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setStatus((currentStatus) => (currentStatus === 'listening' ? getNextSpeechStatus(currentStatus, 'stop') : currentStatus));
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      publishError(createSpeechRecognitionError('unknown'));
    }
  }, [clearProcessingResetTimer, lang, onTranscript, publishError, support]);

  const stopListening = useCallback(() => {
    clearProcessingResetTimer();

    if (!recognitionRef.current) {
      setStatus((currentStatus) => getNextSpeechStatus(currentStatus, 'stop'));
      return;
    }

    recognitionRef.current.stop();
    recognitionRef.current = null;
    setStatus((currentStatus) => getNextSpeechStatus(currentStatus, 'stop'));
  }, [clearProcessingResetTimer]);

  useEffect(() => {
    return () => {
      clearProcessingResetTimer();
      recognitionRef.current?.abort?.();
    };
  }, [clearProcessingResetTimer]);

  return {
    status,
    transcript,
    error,
    isSupported: support.isSupported,
    supportMessage: support.message,
    startListening,
    stopListening,
    resetError,
  };
}

function getBrowserSpeechRecognitionGlobal(): SpeechRecognitionGlobalLike | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window as unknown as SpeechRecognitionGlobalLike;
}
