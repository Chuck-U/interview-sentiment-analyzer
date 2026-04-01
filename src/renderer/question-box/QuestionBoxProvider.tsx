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

import type { QuestionDetectionPayload } from "@/shared/question-detection";

import { useAppSelector } from "../store/hooks";

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
};

const QuestionBoxContext = createContext<QuestionBoxContextValue | null>(null);

function buildMockQuestion(
  sessionId: string,
  text: string,
): QuestionDetectionPayload {
  return {
    sessionId,
    chunkId: crypto.randomUUID(),
    source: "system-audio",
    text,
    questionScore: 0.85,
    nonQuestionScore: 0.15,
    detectedAt: new Date().toISOString(),
  };
}

export function QuestionBoxProvider({ children }: { readonly children: ReactNode }) {
  const currentSessionId = useAppSelector(
    (state) => state.sessionRecording.currentSession?.id,
  );
  const detectedQuestions = useAppSelector((state) => state.questions.detected);

  const sessionQuestions = useMemo(() => {
    if (!currentSessionId) {
      return [];
    }
    return detectedQuestions.filter((q) => q.sessionId === currentSessionId);
  }, [currentSessionId, detectedQuestions]);

  const [mockQuestions, setMockQuestions] = useState<QuestionDetectionPayload[]>(
    [],
  );
  const [isMockRunning, setIsMockRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [viewIndex, setViewIndex] = useState(0);

  const allQuestions = useMemo(
    () => [...sessionQuestions, ...mockQuestions],
    [sessionQuestions, mockQuestions],
  );

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

  const startMockStream = useCallback(() => {
    const sid = currentSessionId ?? "mock-session";
    setIsMockRunning(true);
    setMockQuestions((prev) => [
      ...prev,
      buildMockQuestion(sid, `Mock question at ${new Date().toISOString()}`),
    ]);
  }, [currentSessionId]);

  const stopMockStream = useCallback(() => {
    setIsMockRunning(false);
  }, []);

  useEffect(() => {
    if (!isMockRunning) {
      return;
    }

    const sid = currentSessionId ?? "mock-session";
    const id = window.setInterval(() => {
      setMockQuestions((prev) => [
        ...prev,
        buildMockQuestion(sid, `Mock question at ${new Date().toISOString()}`),
      ]);
    }, 2500);

    return () => {
      window.clearInterval(id);
    };
  }, [isMockRunning, currentSessionId]);

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
