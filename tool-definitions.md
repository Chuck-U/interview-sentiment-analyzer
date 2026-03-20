# Interview analysis tool definitions

This repo now includes a small set of AI-oriented tool definitions for three tightly scoped tasks:

1. measuring interviewer attention
2. measuring interviewee rambling
3. extracting the question or task that should anchor grading

The TypeScript source of truth lives in:

- `src/shared/interview-analysis-tool-definitions.ts`

That module exports:

- function-style tool definitions
- Zod schemas for each tool's return type
- TypeScript types inferred from those schemas

## Research-informed shaping notes

The measurement fields were shaped using quick web review rather than invented from scratch:

- Active listening and conversation-analysis references emphasized observable listener behavior such as backchannels, follow-up specificity, interruptions, and carry-forward of prior content.
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC8570387/
  - https://journals.sagepub.com/doi/10.1177/0265532218758125
- Rambling was framed around tangentiality, circumstantiality, and discourse coherence, while keeping in mind that automated coherence metrics can overfit to surface traits and should be treated cautiously.
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC6048590/
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC1995127/
  - https://aclanthology.org/2021.clpsych-1.16.pdf
- Task extraction was shaped around structured extraction and rubric-ready outputs, so the result separates verbatim prompt text, normalized grading task, ambiguities, and grading focus.
  - https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric/
  - https://langchain-ai.github.io/langchain-benchmarks/notebooks/extraction/chat_extraction.html
  - https://developers.openai.com/cookbook/examples/evaluation/use-cases/structured-outputs-evaluation/

## Design principles

### 1. Score observable behavior, not hidden intent

`measure_interviewer_attention` avoids claiming certainty about what the interviewer was thinking. Instead, it scores transcript-grounded behaviors:

- listener responsiveness
- follow-up specificity
- context carry-forward
- interruption management

### 2. Separate detail richness from true drift

`measure_interviewee_rambling` does not treat every long answer as poor. It distinguishes:

- `focused`
- `expansive-but-on-topic`
- `circumstantial`
- `tangential`

That separation is important because some answers are verbose but still relevant and recover back to the question.

### 3. Keep the grading anchor explicit

`extract_gradable_interview_task` preserves both:

- `promptText`: the closest verbatim wording from the interviewer
- `normalizedTask`: the cleaned statement the grader should use

It also exposes:

- `questionType`
- `expectedAnswerShape`
- `gradingFocus`
- `constraints`
- `ambiguities`

## Tool summary

| Tool | Purpose | Main return fields |
| --- | --- | --- |
| `measure_interviewer_attention` | Estimate whether the interviewer appears attentive during a transcript window | `attentionScore`, `attentionBand`, `signalScores`, `evidence`, `cautions` |
| `measure_interviewee_rambling` | Measure whether the interviewee answer stays on-task or drifts | `ramblingScore`, `ramblingClass`, `directAnswer`, `returnedToQuestion`, `signalScores`, `coachingCue` |
| `extract_gradable_interview_task` | Extract the question/task that should anchor later grading | `promptText`, `normalizedTask`, `questionType`, `expectedAnswerShape`, `gradingFocus`, `constraints`, `ambiguities`, `confidence` |

## Return schema overview

All three return schemas include:

- `schemaVersion: 1`
- concise text summary fields
- evidence arrays with quotes and rationales

The evidence item shape is:

```ts
{
  signal: string;
  quote: string;
  rationale: string;
  turnIndexes?: number[];
}
```

## Intended usage

These definitions are meant to be a pragmatic starting point for hosted-model tool calls and structured outputs. They are intentionally basic:

- good enough to wire into a prompt/tool layer now
- narrow enough to evolve without breaking a large surface area
- explicit about cautions where transcript-only scoring can be misleading

The inline comments in `src/shared/interview-analysis-tool-definitions.ts` explain the rationale behind each tool definition.
