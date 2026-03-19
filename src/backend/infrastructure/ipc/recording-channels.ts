export const RECORDING_CHANNELS = {
  persistChunk: "recording:persist-chunk",
  persistScreenshot: "recording:persist-screenshot",
  exportRecording: "recording:export-recording",
} as const;

export const RECORDING_EVENT_CHANNELS = {
  recordingStateChanged: "recording:event-state-changed",
  chunkPersisted: "recording:event-chunk-persisted",
  captureError: "recording:event-capture-error",
  exportProgress: "recording:event-export-progress",
} as const;
