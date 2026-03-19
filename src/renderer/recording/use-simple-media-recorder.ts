import { useCallback, useEffect, useRef, useState } from "react";

import {
  type RecorderLike,
  type SimpleRecordingKind,
  type SimpleRecordingResult,
  type SimpleRecordingSnapshot,
  SimpleRecordingController,
} from "@/shared/recording-sandbox";

type UseSimpleMediaRecorderState = {
  readonly snapshot: SimpleRecordingSnapshot;
  readonly result: SimpleRecordingResult<Blob> | null;
  readonly savedFilePath: string | null;
};

const INITIAL_SNAPSHOT: SimpleRecordingSnapshot = {
  status: "idle",
  kind: null,
  chunkCount: 0,
};

export type UseSimpleMediaRecorderResult = UseSimpleMediaRecorderState & {
  readonly startRecording: (kind: SimpleRecordingKind) => Promise<void>;
  readonly stopRecording: () => Promise<void>;
  readonly clearRecording: () => void;
};

export function useSimpleMediaRecorder(): UseSimpleMediaRecorderResult {
  const [snapshot, setSnapshot] =
    useState<SimpleRecordingSnapshot>(INITIAL_SNAPSHOT);
  const [result, setResult] = useState<SimpleRecordingResult<Blob> | null>(null);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);
  const controllerRef = useRef<
    SimpleRecordingController<MediaStream, MediaRecorder & RecorderLike, Blob> | null
  >(null);

  if (!controllerRef.current) {
    controllerRef.current = new SimpleRecordingController<
      MediaStream,
      MediaRecorder & RecorderLike,
      Blob
    >({
      mediaDevices: navigator.mediaDevices,
      createRecorder: (stream, mimeType) =>
        (mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream)) as MediaRecorder & RecorderLike,
      isMimeTypeSupported: (mimeType) => MediaRecorder.isTypeSupported(mimeType),
      createBlob: (parts, options) => new Blob([...parts], options),
      onStateChanged: (nextSnapshot) => {
        setSnapshot(nextSnapshot);
      },
    });
  }

  const startRecording = useCallback(
    async (kind: SimpleRecordingKind) => {
      if (!controllerRef.current) {
        return;
      }

      setSavedFilePath(null);
      setResult(null);
      try {
        const sandboxTarget =
          await window.electronApp.recording.beginSandboxRecording({
            kind,
          });
        await controllerRef.current.start(kind, sandboxTarget.outputDirectory);
      } catch {
        // Controller state already captures the failure details for the UI.
      }
    },
    [],
  );

  const stopRecording = useCallback(async () => {
    if (!controllerRef.current) {
      return;
    }

    const nextResult = await controllerRef.current.stop();
    if (!nextResult) {
      return;
    }

    try {
      const buffer = await nextResult.blob.arrayBuffer();
      const saveResult = await window.electronApp.recording.saveSandboxRecording({
        kind: nextResult.kind,
        mimeType: nextResult.mimeType,
        startedAt: nextResult.startedAt,
        stoppedAt: nextResult.stoppedAt,
        buffer,
      });
      controllerRef.current.setSavedFilePath(saveResult.filePath);
      setSavedFilePath(saveResult.filePath);
    } catch {
      // Snapshot error state remains the source of truth for any save failures.
    }
    setResult(nextResult);
  }, []);

  const clearRecording = useCallback(() => {
    setResult(null);
    setSavedFilePath(null);
    setSnapshot(INITIAL_SNAPSHOT);
  }, []);

  useEffect(() => {
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  return {
    snapshot,
    result,
    savedFilePath,
    startRecording,
    stopRecording,
    clearRecording,
  };
}
