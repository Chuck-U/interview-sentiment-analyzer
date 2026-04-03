import { useCallback, useMemo, useRef } from "react";

import { logger } from "@/lib/logger";
import { TRANSCRIPTION_TARGET_SAMPLE_RATE } from "@/lib/audio-chunk-accumulator";
import type { QuestionDetectionPayload } from "@/shared/question-detection";

import { decodeMockClassificationAudio } from "@/lib/decode-mock-classification-audio";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { clearDetectedQuestions } from "../store/slices/questionSlice";
import {
  goNext,
  goPrevious,
  setMockRunning,
  setPaused,
  setViewIndex,
  toggleIsPaused,
} from "../store/slices/questionBoxSlice";

const log = logger.forSource("useQuestionBox");

const MOCK_CLASSIFICATION_MAX_SECONDS = 28;

export type QuestionBoxValue = {
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

export function useQuestionBox(): QuestionBoxValue {
  const dispatch = useAppDispatch();
  const currentSessionId = useAppSelector(
    (state) => state.sessionRecording.currentSession?.id,
  );
  const detectedQuestions = useAppSelector((state) => state.questions.detected);
  const isMockRunning = useAppSelector((state) => state.questionBox.isMockRunning);
  const isPaused = useAppSelector((state) => state.questionBox.isPaused);
  const viewIndex = useAppSelector((state) => state.questionBox.viewIndex);

  const mockRunGenerationRef = useRef(0);

  const allQuestions = detectedQuestions;

  const setPausedCb = useCallback(
    (paused: boolean) => {
      dispatch(setPaused(paused));
    },
    [dispatch],
  );

  const togglePauseResume = useCallback(() => {
    const wasPaused = isPaused;
    const n = allQuestions.length;
    dispatch(toggleIsPaused());
    if (wasPaused) {
      queueMicrotask(() => {
        dispatch(setViewIndex(Math.max(0, n - 1)));
      });
    }
  }, [dispatch, isPaused, allQuestions.length]);

  const goPreviousCb = useCallback(() => {
    dispatch(goPrevious());
  }, [dispatch]);

  const goNextCb = useCallback(() => {
    const last = Math.max(0, allQuestions.length - 1);
    dispatch(goNext({ lastIndex: last }));
  }, [dispatch, allQuestions.length]);

  const stopMockStream = useCallback(() => {
    mockRunGenerationRef.current += 1;
    dispatch(setMockRunning(false));
  }, [dispatch]);

  const startMockStream = useCallback(() => {
    if (isMockRunning) {
      return;
    }

    mockRunGenerationRef.current += 1;
    const generation = mockRunGenerationRef.current;
    const sid = currentSessionId ?? "mock-session";

    dispatch(setMockRunning(true));

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
          dispatch(setMockRunning(false));
        }
      }
    })();
  }, [currentSessionId, dispatch, isMockRunning]);

  const resetQuestions = useCallback(() => {
    dispatch(clearDetectedQuestions());
  }, [dispatch]);

  return useMemo<QuestionBoxValue>(
    () => ({
      allQuestions,
      viewIndex,
      isPaused,
      isMockRunning,
      setPaused: setPausedCb,
      togglePauseResume,
      goPrevious: goPreviousCb,
      goNext: goNextCb,
      startMockStream,
      stopMockStream,
      resetQuestions,
    }),
    [
      allQuestions,
      viewIndex,
      isPaused,
      isMockRunning,
      setPausedCb,
      togglePauseResume,
      goPreviousCb,
      goNextCb,
      startMockStream,
      stopMockStream,
      resetQuestions,
    ],
  );
}
