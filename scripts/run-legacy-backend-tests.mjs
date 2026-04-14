import { readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const backendTestRoot = path.join(
  process.cwd(),
  "dist-electron",
  "src",
  "backend",
  "test",
);

const jestMigratedTests = new Set([
  "detect-live-answer-relevance.test.js",
  "detect-live-question.test.js",
  "live-answer-interval-buffer.test.js",
  "live-transcription-state-graph.test.js",
  "model-manifest.test.js",
  "transcribe-audio-request.test.js",
  "transcription-controller.test.js",
]);

const legacyTests = readdirSync(backendTestRoot)
  .filter((entry) => entry.endsWith(".test.js"))
  .filter((entry) => !jestMigratedTests.has(entry))
  .map((entry) => path.join(backendTestRoot, entry));

const result = spawnSync(process.execPath, ["--test", ...legacyTests], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
