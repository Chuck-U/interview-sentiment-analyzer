import { useMemo } from "react";

import { useAppSelector } from "./store/hooks";

export function QuestionBoxMain() {
  const currentSessionId = useAppSelector(
    (state) => state.sessionRecording.currentSession?.id,
  );
  const detectedQuestions = useAppSelector((state) => state.questions.detected);

  const sessionQuestions = useMemo(() => {
    if (!currentSessionId) {
      return [];
    }

    return detectedQuestions.filter(
      (question) => question.sessionId === currentSessionId,
    );
  }, [currentSessionId, detectedQuestions]);

  const latestQuestion = sessionQuestions.at(-1) ?? null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-y-auto px-4 py-3 text-white">
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Live Questions
        </span>
        <h2 className="text-lg font-semibold">
          {latestQuestion ? "Latest interviewer question" : "No question detected yet"}
        </h2>
      </div>

      {latestQuestion ? (
        <div className="rounded-md border border-border/50 bg-background/20 p-4 backdrop-blur-sm">
          <p className="whitespace-pre-wrap text-lg leading-7">
            {latestQuestion.text}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Confidence {(latestQuestion.questionScore * 100).toFixed(0)}%
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border/50 bg-background/10 p-4 text-sm text-muted-foreground">
          Start recording to surface likely interview questions from the mixed
          desktop audio stream.
        </div>
      )}

      {sessionQuestions.length > 1 ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Recent detections
          </span>
          {sessionQuestions
            .slice(0, -1)
            .reverse()
            .map((question) => (
              <div
                key={question.chunkId}
                className="rounded-md border border-border/40 bg-background/10 p-3"
              >
                <p className="whitespace-pre-wrap text-sm leading-6">
                  {question.text}
                </p>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}
