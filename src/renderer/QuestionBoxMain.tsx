import { useMemo } from "react";

import { cn } from "@/lib/utils";

import { QuestionStreamCard } from "./question-box/QuestionStreamCard";
import { useQuestionBox } from "./question-box/QuestionBoxProvider";

export function QuestionBoxMain() {
  const { allQuestions, viewIndex } = useQuestionBox();

  const hasQuestions = allQuestions.length > 0;

  const stackItems = useMemo(
    () =>
      allQuestions.map((question, index) => ({
        question,
        index,
        offset: (viewIndex - index) * 14,
        isActive: index === viewIndex,
        depth: Math.abs(viewIndex - index),
      })),
    [allQuestions, viewIndex],
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden px-4 py-3 text-white">
      <div className="flex shrink-0 flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Live Questions
        </span>
        <h2 className="text-lg font-semibold">
          {hasQuestions
            ? "Interviewer questions"
            : "No question detected yet"}
        </h2>
      </div>

      <div className="relative min-h-0 flex-1">
        {hasQuestions ? (
          <div className="relative mx-auto flex h-full min-h-[200px] w-full max-w-lg items-start justify-center pt-2 pb-8">
            <div className="relative h-[min(320px,45vh)] w-full">
              {stackItems.map(({ question, offset, isActive, depth }) => (
                <div
                  key={question.chunkId}
                  className={cn(
                    "absolute left-0 right-0 top-0 origin-top transition-[transform,opacity] duration-300 ease-out",
                    depth > 4 && "pointer-events-none opacity-0",
                  )}
                  style={{
                    transform: `translateY(${offset}px) scale(${isActive ? 1 : Math.max(0.88, 1 - depth * 0.04)})`,
                    zIndex: isActive ? 200 : 100 - depth,
                    opacity: depth > 4 ? 0 : isActive ? 1 : Math.max(0.45, 1 - depth * 0.12),
                  }}
                >
                  <QuestionStreamCard
                    title={isActive ? "In view" : "Question"}
                    body={question.text}
                    meta={`Confidence ${(question.questionScore * 100).toFixed(0)}% · ${new Date(question.detectedAt).toLocaleTimeString()}`}
                    isActive={isActive}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border/50 bg-background/10 p-4 text-sm text-muted-foreground">
            Start recording to surface likely interview questions from the mixed
            desktop audio stream, or use mock start to preview the card stack.
          </div>
        )}
      </div>
    </div>
  );
}
