import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { logger } from "@/lib/logger";
import { TRANSCRIPTION_TARGET_SAMPLE_RATE } from "@/lib/audio-chunk-accumulator";
import type { QuestionDetectionPayload } from "@/shared/question-detection";

import { useAppDispatch, useAppSelector } from "../store/hooks";
import { clearDetectedQuestions } from "../store/slices/questionSlice";
import { decodeMockClassificationAudio } from "../../lib/decode-mock-classification-audio";

const log = logger.forSource("QuestionBoxProvider");

/**
 * Cap IPC payload / ASR window. Bundled clip is shorter; this guards larger assets.
 */
const MOCK_CLASSIFICATION_MAX_SECONDS = 28;

type QuestionBoxContextValue = {
  readonly allQuestions: readonly QuestionDetectionPayload[];
  readonly viewIndex: number;
  readonly isPaused: boolean;
  readonly isMockRunning: boolean;
  readonly setPaused: (paused: boolean) => void;
  readonly togglePauseResume: () => void;
  readonly goPrevious: () => void;
  readonly goNext: () => void;
  readonly startMockStream: () => void;
  readonly stopMockStream: () => void;
  readonly resetQuestions: () => void;
};

const QuestionBoxContext = createContext<QuestionBoxContextValue | null>(null);

export function QuestionBoxProvider({ children }: { readonly children: ReactNode }) {
  const dispatch = useAppDispatch();
  const currentSessionId = useAppSelector(
    (state) => state.sessionRecording.currentSession?.id,
  );
  const detectedQuestions = useAppSelector((state) => state.questions.detected);

  const [isMockRunning, setIsMockRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [viewIndex, setViewIndex] = useState(0);

  const mockRunGenerationRef = useRef(0);

  const allQuestions = detectedQuestions;

  const allQuestionsRef = useRef(allQuestions);
  const viewIndexRef = useRef(viewIndex);

  useLayoutEffect(() => {
    allQuestionsRef.current = allQuestions;
  }, [allQuestions]);

  useLayoutEffect(() => {
    viewIndexRef.current = viewIndex;
  }, [viewIndex]);

  const prevLenRef = useRef(0);

  useEffect(() => {
    const n = allQuestions.length;
    const prev = prevLenRef.current;
    const vi = viewIndexRef.current;

    queueMicrotask(() => {
      if (n === 0) {
        setViewIndex(0);
        prevLenRef.current = 0;
        return;
      }

      let next = vi;
      if (n > prev && !isPaused) {
        const atEnd = prev === 0 || vi === prev - 1;
        if (atEnd) {
          next = n - 1;
        }
      }
      if (vi >= n) {
        next = Math.max(0, n - 1);
      }
      if (next !== vi) {
        setViewIndex(next);
      }
      prevLenRef.current = n;
    });
  }, [allQuestions.length, isPaused]);

  const setPaused = useCallback((paused: boolean) => {
    setIsPaused(paused);
  }, []);

  const togglePauseResume = useCallback(() => {
    setIsPaused((p) => {
      if (p) {
        queueMicrotask(() => {
          const n = allQuestionsRef.current.length;
          setViewIndex(Math.max(0, n - 1));
        });
      }
      return !p;
    });
  }, []);

  const goPrevious = useCallback(() => {
    setViewIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setViewIndex((i) => Math.min(allQuestions.length - 1, i + 1));
  }, [allQuestions.length]);

  const stopMockStream = useCallback(() => {
    mockRunGenerationRef.current += 1;
    setIsMockRunning(false);
  }, []);

  const startMockStream = useCallback(() => {
    if (isMockRunning) {
      return;
    }

    mockRunGenerationRef.current += 1;
    const generation = mockRunGenerationRef.current;
    const sid = currentSessionId ?? "mock-session";

    setIsMockRunning(true);

    void (async () => {
      try {
        const pcm = await decodeMockClassificationAudio();
        if (mockRunGenerationRef.current !== generation) {
          return;
        }

        const maxSamples = TRANSCRIPTION_TARGET_SAMPLE_RATE * MOCK_CLASSIFICATION_MAX_SECONDS;
        const pcmWindow =
          pcm.length <= maxSamples ? pcm : pcm.subarray(0, maxSamples);

        if (pcmWindow.length === 0) {
          log.ger({
            type: "warn",
            message: "[question-box] mock classification audio decoded to empty PCM",
          });
          return;
        }

        log.ger({
          type: "info",
          message: "[question-box] running transcribeAudio on mock classification clip",
          data: {
            sessionId: sid.slice(0, 8),
            samples: pcmWindow.length,
          },
        });

        await window.electronApp.transcription.transcribeAudio({
          source: "desktop-capture",
          sessionId: sid,
          chunkId: crypto.randomUUID(),
          pcmSamples: Array.from(pcmWindow),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.ger({
          type: "error",
          message: "[question-box] mock classification audio pipeline failed",
          data: { error: message },
        });
      } finally {
        if (mockRunGenerationRef.current === generation) {
          setIsMockRunning(false);
        }
      }
    })();
  }, [currentSessionId, isMockRunning]);

  const resetQuestions = useCallback(() => {
    dispatch(clearDetectedQuestions());
  }, [dispatch]);

  const value = useMemo<QuestionBoxContextValue>(
    () => ({
      allQuestions,
      viewIndex,
      isPaused,
      isMockRunning,
      setPaused,
      togglePauseResume,
      goPrevious,
      goNext,
      startMockStream,
      stopMockStream,
      resetQuestions,
    }),
    [
      allQuestions,
      viewIndex,
      isPaused,
      isMockRunning,
      setPaused,
      togglePauseResume,
      goPrevious,
      goNext,
      startMockStream,
      stopMockStream,
      resetQuestions,
    ],
  );

  return (
    <QuestionBoxContext.Provider value={value}>
      {children}
    </QuestionBoxContext.Provider>
  );
}

export function useQuestionBox(): QuestionBoxContextValue {
  const ctx = useContext(QuestionBoxContext);
  if (!ctx) {
    throw new Error("useQuestionBox must be used within QuestionBoxProvider");
  }
  return ctx;
}

export function useQuestionBoxOptional(): QuestionBoxContextValue | null {
  return useContext(QuestionBoxContext);
}
