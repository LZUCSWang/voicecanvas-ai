import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SPEECH_SILENCE_COMMIT_DELAY_MS,
  configureSpeechRecognitionCapture,
  createSpeechRecognitionError,
  createSpeechTranscriptBuffer,
  detectSpeechRecognitionSupport,
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
  const silenceCommitTimerRef = useRef<number | null>(null);
  const isCommitPendingRef = useRef(false);
  const transcriptBufferRef = useRef(createSpeechTranscriptBuffer());
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

  const clearSilenceCommitTimer = useCallback(() => {
    if (silenceCommitTimerRef.current === null || typeof window === 'undefined') {
      return;
    }

    window.clearTimeout(silenceCommitTimerRef.current);
    silenceCommitTimerRef.current = null;
  }, []);

  const scheduleProcessingReset = useCallback(() => {
    const finishProcessing = () => {
      processingResetTimerRef.current = null;
      setStatus((currentStatus) => (currentStatus === 'processing' ? getNextSpeechStatus(currentStatus, 'processed') : currentStatus));
    };

    if (typeof window === 'undefined') {
      finishProcessing();
      return;
    }

    processingResetTimerRef.current = window.setTimeout(finishProcessing, 350);
  }, []);

  const publishError = useCallback(
    (nextError: SpeechRecognitionErrorState) => {
      clearProcessingResetTimer();
      clearSilenceCommitTimer();
      isCommitPendingRef.current = false;
      transcriptBufferRef.current.reset();
      setError(nextError);
      setStatus(nextError.status);
      onError?.(nextError);
    },
    [clearProcessingResetTimer, clearSilenceCommitTimer, onError],
  );

  const resetError = useCallback(() => {
    clearProcessingResetTimer();
    clearSilenceCommitTimer();
    isCommitPendingRef.current = false;
    transcriptBufferRef.current.reset();
    setError(null);
    setStatus((currentStatus) => getNextSpeechStatus(currentStatus, 'reset'));
  }, [clearProcessingResetTimer, clearSilenceCommitTimer]);

  const processBufferedTranscript = useCallback(
    (finalTranscript: string) => {
      if (!finalTranscript) {
        publishError(createSpeechRecognitionError('empty-transcript'));
        return;
      }

      setTranscript(finalTranscript);
      setError(null);
      setStatus((currentStatus) => getNextSpeechStatus(currentStatus, 'result'));

      Promise.resolve(onTranscript?.(finalTranscript)).finally(scheduleProcessingReset);
    },
    [onTranscript, publishError, scheduleProcessingReset],
  );

  const finishBufferedTranscript = useCallback(() => {
    clearSilenceCommitTimer();
    isCommitPendingRef.current = false;

    const finalTranscript = transcriptBufferRef.current.consumeTranscript();
    processBufferedTranscript(finalTranscript);
  }, [clearSilenceCommitTimer, processBufferedTranscript]);

  const requestBufferedTranscriptCommit = useCallback(() => {
    clearSilenceCommitTimer();

    if (isCommitPendingRef.current) {
      return;
    }

    isCommitPendingRef.current = true;

    if (!recognitionRef.current) {
      finishBufferedTranscript();
      return;
    }

    recognitionRef.current.stop();
  }, [clearSilenceCommitTimer, finishBufferedTranscript]);

  const startListening = useCallback(() => {
    clearProcessingResetTimer();
    clearSilenceCommitTimer();
    isCommitPendingRef.current = false;
    transcriptBufferRef.current.reset();

    if (!support.isSupported || !support.RecognitionConstructor) {
      publishError(createSpeechRecognitionError('not-supported'));
      return;
    }

    if (recognitionRef.current) {
      return;
    }

    const recognition = new support.RecognitionConstructor();
    configureSpeechRecognitionCapture(recognition, lang);

    recognition.onstart = () => {
      setError(null);
      setStatus((currentStatus) => getNextSpeechStatus(currentStatus, 'start'));
    };

    recognition.onresult = (event: SpeechRecognitionResultEventLike) => {
      const speechUpdate = transcriptBufferRef.current.appendResult(event);

      if (!speechUpdate.hasSpeech) {
        return;
      }

      setTranscript(speechUpdate.heardTranscript);
      setError(null);

      if (isCommitPendingRef.current) {
        return;
      }

      clearSilenceCommitTimer();

      if (typeof window === 'undefined') {
        requestBufferedTranscriptCommit();
        return;
      }

      silenceCommitTimerRef.current = window.setTimeout(requestBufferedTranscriptCommit, SPEECH_SILENCE_COMMIT_DELAY_MS);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      publishError(createSpeechRecognitionError(event.error ?? 'unknown'));
    };

    recognition.onend = () => {
      recognitionRef.current = null;

      if (isCommitPendingRef.current) {
        finishBufferedTranscript();
        return;
      }

      setStatus((currentStatus) =>
        currentStatus === 'listening' && !transcriptBufferRef.current.hasTranscript()
          ? getNextSpeechStatus(currentStatus, 'stop')
          : currentStatus,
      );
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      publishError(createSpeechRecognitionError('unknown'));
    }
  }, [
    clearProcessingResetTimer,
    clearSilenceCommitTimer,
    finishBufferedTranscript,
    lang,
    publishError,
    requestBufferedTranscriptCommit,
    support,
  ]);

  const stopListening = useCallback(() => {
    clearProcessingResetTimer();
    clearSilenceCommitTimer();

    if (transcriptBufferRef.current.hasTranscript()) {
      requestBufferedTranscriptCommit();
      return;
    }

    if (!recognitionRef.current) {
      transcriptBufferRef.current.reset();
      setStatus((currentStatus) => getNextSpeechStatus(currentStatus, 'stop'));
      return;
    }

    recognitionRef.current.stop();
    recognitionRef.current = null;
    isCommitPendingRef.current = false;
    transcriptBufferRef.current.reset();
    setStatus((currentStatus) => getNextSpeechStatus(currentStatus, 'stop'));
  }, [clearProcessingResetTimer, clearSilenceCommitTimer, requestBufferedTranscriptCommit]);

  useEffect(() => {
    return () => {
      clearProcessingResetTimer();
      clearSilenceCommitTimer();
      isCommitPendingRef.current = false;
      transcriptBufferRef.current.reset();
      recognitionRef.current?.abort?.();
    };
  }, [clearProcessingResetTimer, clearSilenceCommitTimer]);

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
