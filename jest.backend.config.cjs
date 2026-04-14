module.exports = {
  rootDir: __dirname,
  testEnvironment: "node",
  testMatch: [
    "<rootDir>/dist-electron/src/backend/test/detect-live-answer-relevance.test.js",
    "<rootDir>/dist-electron/src/backend/test/detect-live-question.test.js",
    "<rootDir>/dist-electron/src/backend/test/live-transcription-state-graph.test.js",
    "<rootDir>/dist-electron/src/backend/test/model-manifest.test.js",
    "<rootDir>/dist-electron/src/backend/test/transcribe-audio-request.test.js",
    "<rootDir>/dist-electron/src/backend/test/transcription-controller.test.js",
  ],
};
