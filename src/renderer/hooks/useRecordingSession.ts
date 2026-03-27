import { useCallback, useEffect, useRef } from "react";

import { CaptureManager } from "@/renderer/recording/capture-manager";
import { decodeAudioToPcm } from "@/renderer/recording/audio-decoder";
import { selectCaptureSources } from "@/renderer/store/slices/captureOptionsSlice";
import {
  segmentReceived,
  transcriptionChunkFailed,
} from "@/renderer/store/slices/diarizationSlice";
import {
  setFeedbackMessage,
  setIsStarting,
  setIsStopping,
  setRecordingState,
  syncIncomingSession,
} from "@/renderer/store/slices/sessionRecordingSlice";
import { store } from "@/renderer/store/store";
import type { SessionSnapshot } from "@/shared/session-lifecycle";
import { logger } from "@/lib/logger";

import { useAppDispatch, useAppSelector } from "../store/hooks";
// TODO: restore when multi-source transcription is re-enabled
// import { isAudioMediaChunkSource } from "@/shared/session-lifecycle";

const log = logger.forSource("useRecordingSession");

export function useRecordingSession() {
  const dispatch = useAppDispatch();
  const currentSessionRef = useRef(
    store.getState().sessionRecording.currentSession,
  );
  const captureManagerRef = useRef<CaptureManager | null>(null);

  const currentSession = useAppSelector(
    (state) => state.sessionRecording.currentSession,
  );
  const isStarting = useAppSelector(
    (state) => state.sessionRecording.isStarting,
  );
  const isStopping = useAppSelector(
    (state) => state.sessionRecording.isStopping,
  );
  const captureConfig = useAppSelector(
    (state) => state.captureOptions.config,
  );

  currentSessionRef.current = currentSession;

  const syncIncomingSessionFromMain = useCallback(
    (session: SessionSnapshot) => {
      dispatch(syncIncomingSession(session));
    },
    [dispatch],
  );

  const createCaptureManager = useCallback(() => {
    return new CaptureManager({
      async onChunkAvailable(
        sessionId,
        source,
        sequenceNumber,
        mimeType,
        recordedAt,
        buffer,
      ) {
        const result = await window.electronApp.recording.persistChunk({
          sessionId,
          source,
          sequenceNumber,
          mimeType,
          recordedAt,
          buffer,
        });
        // Only transcribe the desktop-capture source (which carries mixed
        // audio) to produce a single transcript stream. Other audio sources
        // (microphone, system-audio) are gated out for now.
        // TODO: restore multi-source transcription behind a config flag.
        if (source === "desktop-capture") {
          void (async () => {
            log.ger({
              type: "info",
              message: "[transcription] chunk queued for ASR (after persist)",
              data: {
                sessionId: sessionId.slice(0, 8),
                chunkId: result.chunkId,
                source,
                bufferBytes: buffer.byteLength,
              },
            });
            try {
              const pcm = await decodeAudioToPcm(buffer);
              log.ger({
                type: "debug",
                message: "[transcription] PCM decoded; invoking main process",
                data: {
                  chunkId: result.chunkId,
                  pcmSamples: pcm.length,
                },
              });
              const transcription =
                await window.electronApp.transcription.transcribeAudio({
                  source,
                  pcmSamples: Array.from(pcm),
                  sessionId,
                  chunkId: result.chunkId,
                });
              log.ger({
                type: "info",
                message: "[transcription] segment received from main",
                data: {
                  chunkId: transcription.chunkId,
                  textLength: transcription.text.length,
                },
              });
              dispatch(
                segmentReceived({
                  sessionId: transcription.sessionId,
                  chunkId: transcription.chunkId,
                  text: transcription.text,
                  chunks: transcription.chunks,
                }),
              );
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              const stack = err instanceof Error ? err.stack : undefined;
              log.ger({
                type: "error",
                message: "[transcription] decode or transcribeAudio failed",
                data: {
                  chunkId: result.chunkId,
                  source,
                  error: message,
                  stack,
                },
              });
              dispatch(
                transcriptionChunkFailed({
                  chunkId: result.chunkId,
                  message,
                }),
              );
            }
          })();
        }
        return result;
      },
      onScreenshotAvailable(
        sessionId,
        sequenceNumber,
        mimeType,
        capturedAt,
        buffer,
      ) {
        return window.electronApp.recording.persistScreenshot({
          sessionId,
          sequenceNumber,
          mimeType,
          capturedAt,
          buffer,
        });
      },
      onStateChanged(state) {
        dispatch(setRecordingState(state));
      },
      onCaptureError(_sessionId, source, _errorCode, errorMessage) {
        dispatch(
          setFeedbackMessage(`Capture error (${source}): ${errorMessage}`),
        );
      },
    });
  }, [dispatch]);

  const handleStartRecording = useCallback(async () => {
    const state = store.getState();
    const isBusy =
      state.sessionRecording.isStarting || state.sessionRecording.isStopping;
    if (isBusy || currentSessionRef.current?.status === "active") {
      return;
    }

    const captureSources = selectCaptureSources(state);
    const config = state.captureOptions.config;

    if (captureSources.length === 0) {
      dispatch(
        setFeedbackMessage(
          "Enable at least one capture source before recording.",
        ),
      );
      return;
    }

    dispatch(setIsStarting(true));
    dispatch(setFeedbackMessage("Starting recording session."));

    try {
      const response = await window.electronApp.sessionLifecycle.startSession({
        captureSources,
      });

      syncIncomingSessionFromMain(response.session);
      dispatch(
        setFeedbackMessage(
          `Recording started for session ${response.session.id.slice(0, 8)}.`,
        ),
      );

      if (captureManagerRef.current) {
        captureManagerRef.current.destroy();
      }

      const manager = createCaptureManager();
      captureManagerRef.current = manager;
      log.ger({
        type: "info",
        message: "recordingStart: capture attached for session",
        data: {
          sessionId: response.session.id.slice(0, 8),
          captureSources,
        },
      });
      await manager.startCapture(response.session.id, captureSources, config);
    } catch (error) {
      dispatch(
        setFeedbackMessage(
          error instanceof Error ? error.message : "Unable to start recording.",
        ),
      );
    } finally {
      dispatch(setIsStarting(false));
    }
  }, [createCaptureManager, dispatch, syncIncomingSessionFromMain]);

  const handleStopRecording = useCallback(async () => {
    const session = currentSessionRef.current;
    const state = store.getState();
    const isBusy =
      state.sessionRecording.isStarting || state.sessionRecording.isStopping;

    if (isBusy || session?.status !== "active") {
      return;
    }

    dispatch(setIsStopping(true));
    dispatch(setFeedbackMessage("Stopping recording session."));

    try {
      if (captureManagerRef.current) {
        await captureManagerRef.current.stopCapture();
      }

      const response =
        await window.electronApp.sessionLifecycle.finalizeSession({
          sessionId: session.id,
        });

      syncIncomingSessionFromMain(response.session);
      dispatch(
        setFeedbackMessage(
          `Recording stopped. Session ${session.id.slice(0, 8)} is finalizing.`,
        ),
      );
    } catch (error) {
      dispatch(
        setFeedbackMessage(
          error instanceof Error ? error.message : "Unable to stop recording.",
        ),
      );
    } finally {
      dispatch(setIsStopping(false));
    }
  }, [dispatch, syncIncomingSessionFromMain]);

  const handleExportRecording = useCallback(async () => {
    const session = currentSessionRef.current;
    if (!session) {
      return;
    }

    if (captureManagerRef.current) {
      captureManagerRef.current.setExportStatus("assembling");
    }

    try {
      const result = await window.electronApp.recording.exportRecording({
        sessionId: session.id,
      });

      if (captureManagerRef.current) {
        captureManagerRef.current.setExportStatus(
          result.exportStatus as "completed" | "failed",
          result.exportFilePath,
        );
      }

      if (result.exportStatus === "completed") {
        dispatch(setFeedbackMessage("Recording exported successfully."));
      } else {
        dispatch(setFeedbackMessage("Recording export failed."));
      }
    } catch (error) {
      if (captureManagerRef.current) {
        captureManagerRef.current.setExportStatus(
          "failed",
          undefined,
          error instanceof Error ? error.message : "Export failed",
        );
      }
      dispatch(
        setFeedbackMessage(
          error instanceof Error ? error.message : "Unable to export recording.",
        ),
      );
    }
  }, [dispatch]);

  const handleToggleRecording = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        await handleStartRecording();
        return;
      }

      await handleStopRecording();
    },
    [handleStartRecording, handleStopRecording],
  );

  useEffect(() => {
    const unsubscribeSessionChanged =
      window.electronApp.sessionLifecycleEvents.onSessionChanged((session) => {
        syncIncomingSessionFromMain(session);

        if (session.status === "active") {
          dispatch(
            setFeedbackMessage(
              `Recording started for session ${session.id.slice(0, 8)}.`,
            ),
          );
        }

        if (session.status === "finalizing") {
          dispatch(
            setFeedbackMessage(
              `Recording stopped. Session ${session.id.slice(0, 8)} is finalizing.`,
            ),
          );
        }
      });
    const unsubscribeSessionFinalized =
      window.electronApp.sessionLifecycleEvents.onSessionFinalized(
        (session) => {
          syncIncomingSessionFromMain(session);
          dispatch(
            setFeedbackMessage(`Session ${session.id.slice(0, 8)} finalized.`),
          );
        },
      );
    const unsubscribeRecoveryIssue =
      window.electronApp.sessionLifecycleEvents.onRecoveryIssue((issue) => {
        dispatch(setFeedbackMessage(issue.message));
      });

    return () => {
      unsubscribeSessionChanged();
      unsubscribeSessionFinalized();
      unsubscribeRecoveryIssue();
    };
  }, [dispatch, syncIncomingSessionFromMain]);

  useEffect(() => {
    const unsubscribeRecordingState =
      window.electronApp.recordingEvents.onRecordingStateChanged((state) => {
        dispatch(setRecordingState(state));
      });
    const unsubscribeExportProgress =
      window.electronApp.recordingEvents.onExportProgress((progress) => {
        if (progress.exportStatus === "completed" && progress.exportFilePath) {
          dispatch(setFeedbackMessage("Recording exported successfully."));
        } else if (progress.exportStatus === "failed") {
          dispatch(
            setFeedbackMessage(
              progress.errorMessage ?? "Recording export failed.",
            ),
          );
        }
      });

    return () => {
      unsubscribeRecordingState();
      unsubscribeExportProgress();
    };
  }, [dispatch]);

  useEffect(() => {
    const session = currentSession;

    if (!session) {
      return;
    }

    if (session.status === "active") {
      if (captureManagerRef.current || isStarting) {
        return;
      }

      const manager = createCaptureManager();
      captureManagerRef.current = manager;

      log.ger({
        type: "info",
        message: "recordingStart: capture re-attached from session sync",
        data: {
          sessionId: session.id.slice(0, 8),
          captureSources: session.captureSources,
        },
      });

      void manager
        .startCapture(session.id, session.captureSources, captureConfig)
        .catch((error: unknown) => {
          dispatch(
            setFeedbackMessage(
              error instanceof Error
                ? error.message
                : "Unable to attach capture.",
            ),
          );
          if (captureManagerRef.current === manager) {
            captureManagerRef.current = null;
          }
        });
      return;
    }

    if (
      session.status === "finalizing" &&
      captureManagerRef.current &&
      !isStopping
    ) {
      void captureManagerRef.current.stopCapture().catch((error: unknown) => {
        dispatch(
          setFeedbackMessage(
            error instanceof Error ? error.message : "Unable to stop capture.",
          ),
        );
      });
    }
  }, [
    captureConfig,
    createCaptureManager,
    currentSession,
    dispatch,
    isStarting,
    isStopping,
  ]);

  useEffect(() => {
    return () => {
      if (captureManagerRef.current) {
        captureManagerRef.current.destroy();
        captureManagerRef.current = null;
      }
    };
  }, []);

  const handleCloseApplication = useCallback(async () => {
    dispatch(setFeedbackMessage("Closing application."));
    await window.electronApp.appControls.closeApplication();
  }, [dispatch]);

  return {
    handleStartRecording,
    handleStopRecording,
    handleExportRecording,
    handleToggleRecording,
    handleCloseApplication,
  };
}
