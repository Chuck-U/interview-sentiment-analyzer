import assert from "node:assert/strict";
import test from "node:test";

import {
  INTERVIEW_ANALYSIS_TOOL_DEFINITIONS,
  extractGradableInterviewTaskResultSchema,
  measureIntervieweeRamblingResultSchema,
  measureInterviewerAttentionResultSchema,
} from "../../shared";

test("interview analysis tool definitions expose the expected function names", () => {
  assert.deepEqual(
    INTERVIEW_ANALYSIS_TOOL_DEFINITIONS.map((tool) => tool.function.name),
    [
      "measure_interviewer_attention",
      "measure_interviewee_rambling",
      "extract_gradable_interview_task",
    ],
  );

  for (const tool of INTERVIEW_ANALYSIS_TOOL_DEFINITIONS) {
    assert.equal(tool.type, "function");
    assert.equal(tool.function.strict, true);
    assert.equal(tool.resultSchemaVersion, 1);
  }
});

test("interviewer attention schema validates representative output", () => {
  const parsed = measureInterviewerAttentionResultSchema.parse({
    schemaVersion: 1,
    attentionScore: 0.76,
    attentionBand: "high",
    summary:
      "The interviewer stayed engaged with short acknowledgements and precise follow-ups grounded in the candidate's last example.",
    signalScores: {
      listenerResponsiveness: 0.82,
      followUpSpecificity: 0.78,
      contextCarryForward: 0.74,
      interruptionManagement: 0.7,
    },
    evidence: [
      {
        signal: "followUpSpecificity",
        quote:
          "You mentioned conflicting deadlines there. How did you decide what to cut first?",
        rationale:
          "The follow-up picks up a concrete detail from the prior answer instead of moving to a generic next question.",
        turnIndexes: [3],
      },
    ],
    cautions: [
      "Transcript-only evidence can miss visual attention cues or intentional quiet note taking.",
    ],
  });

  assert.equal(parsed.attentionBand, "high");
});

test("interviewee rambling schema distinguishes circumstantial outputs", () => {
  const parsed = measureIntervieweeRamblingResultSchema.parse({
    schemaVersion: 1,
    ramblingScore: 0.61,
    ramblingClass: "circumstantial",
    summary:
      "The answer eventually lands on the requested example, but only after several side details about team history and tooling.",
    directAnswer:
      "I handled ambiguity by time-boxing discovery, aligning stakeholders on decision criteria, and documenting tradeoffs.",
    returnedToQuestion: true,
    signalScores: {
      directAnswerDelay: 0.67,
      topicalDrift: 0.54,
      detailOverrun: 0.74,
      repetition: 0.41,
      recoveryFailure: 0.29,
    },
    evidence: [
      {
        signal: "detailOverrun",
        quote:
          "Before I get to the project itself, it helps to know how the whole org was structured at the time...",
        rationale:
          "The speaker spends multiple turns on setup before answering the actual question.",
        turnIndexes: [4, 5],
      },
    ],
    coachingCue: "Lead with the direct answer, then add only the context needed to make the example interpretable.",
  });

  assert.equal(parsed.returnedToQuestion, true);
});

test("gradable task extraction schema keeps grading anchors explicit", () => {
  const parsed = extractGradableInterviewTaskResultSchema.parse({
    schemaVersion: 1,
    promptText:
      "Tell me about a time you had very little guidance and still had to make forward progress.",
    normalizedTask:
      "Provide a concrete example of handling ambiguity with limited guidance and explain the actions and outcome.",
    questionType: "behavioral",
    expectedAnswerShape: "star",
    isMultiPart: false,
    gradingFocus: [
      "Whether the answer names a specific ambiguous situation",
      "Whether the candidate explains actions taken to reduce uncertainty",
      "Whether the result or learning is clear",
    ],
    constraints: ["Use a real past example rather than a hypothetical answer"],
    ambiguities: [],
    confidence: 0.88,
    evidence: [
      {
        signal: "promptText",
        quote:
          "Tell me about a time you had very little guidance and still had to make forward progress.",
        rationale:
          "This line contains the full behavioral ask and the grading criteria can be derived from it directly.",
        turnIndexes: [1],
      },
    ],
  });

  assert.equal(parsed.expectedAnswerShape, "star");
});
