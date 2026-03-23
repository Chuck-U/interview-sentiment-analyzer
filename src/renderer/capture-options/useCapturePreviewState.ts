import { useCallback, useEffect, useState } from "react";

type UseCapturePreviewStateArgs = {
  readonly isMenuActive: boolean;
  readonly microphoneEnabled: boolean;
  readonly microphoneDeviceId?: string;
  readonly webcamDeviceId?: string;
  readonly displayId?: string;
  readonly onError?: (message: string) => void;
};

type UseCapturePreviewStateResult = {
  readonly microphoneLevel: number;
  readonly isWebcamPreviewVisible: boolean;
  readonly isWebcamPreviewLoading: boolean;
  readonly webcamPreviewStream: MediaStream | null;
  readonly isDesktopPreviewVisible: boolean;
  readonly isDesktopPreviewLoading: boolean;
  readonly desktopPreviewStream: MediaStream | null;
  readonly setWebcamPreviewVisible: (visible: boolean) => void;
  readonly setDesktopPreviewVisible: (visible: boolean) => void;
};

function stopMediaStream(stream: MediaStream | null) {
  if (!stream) {
    return;
  }

  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function useMicrophoneLevelMeter(args: {
  readonly isMenuActive: boolean;
  readonly microphoneEnabled: boolean;
  readonly microphoneDeviceId?: string;
  readonly onError?: (message: string) => void;
}) {
  const { isMenuActive, microphoneEnabled, microphoneDeviceId, onError } = args;
  const [microphoneLevel, setMicrophoneLevel] = useState(0);

  useEffect(() => {
    if (!isMenuActive || !microphoneEnabled) {
      queueMicrotask(() => {
        setMicrophoneLevel(0);
      });
      return;
    }

    let cancelled = false;
    let animationFrameId = 0;
    let audioContext: AudioContext | null = null;
    let previewStream: MediaStream | null = null;

    const startMeter = async () => {
      try {
        previewStream = await navigator.mediaDevices.getUserMedia({
          audio: microphoneDeviceId
            ? {
                deviceId: { exact: microphoneDeviceId },
              }
            : true,
          video: false,
        });

        if (cancelled) {
          stopMediaStream(previewStream);
          return;
        }

        audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        const source = audioContext.createMediaStreamSource(previewStream);
        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;

          for (const value of data) {
            const normalized = (value - 128) / 128;
            sum += normalized * normalized;
          }

          const rms = Math.sqrt(sum / data.length);
          const scaledLevel = Math.min(100, Math.round(rms * 180));

          if (!cancelled) {
            setMicrophoneLevel(scaledLevel);
            animationFrameId = window.requestAnimationFrame(tick);
          }
        };

        tick();
      } catch (error) {
        setMicrophoneLevel(0);
        onError?.(
          error instanceof Error
            ? error.message
            : "Unable to start microphone level meter.",
        );
      }
    };

    void startMeter();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrameId);
      setMicrophoneLevel(0);
      stopMediaStream(previewStream);

      if (audioContext) {
        void audioContext.close();
      }
    };
  }, [isMenuActive, microphoneEnabled, microphoneDeviceId, onError]);

  return microphoneLevel;
}

function usePreviewStream(args: {
  readonly isActive: boolean;
  readonly startPreview: () => Promise<MediaStream>;
  readonly onErrorMessage: string;
  readonly onError?: (message: string) => void;
}) {
  const { isActive, startPreview, onErrorMessage, onError } = args;
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isActive) {
      queueMicrotask(() => {
        setIsLoading(false);
        setStream((previousStream) => {
          stopMediaStream(previousStream);
          return null;
        });
      });
      return;
    }

    let cancelled = false;
    let nextStream: MediaStream | null = null;

    const run = async () => {
      setIsLoading(true);

      try {
        nextStream = await startPreview();

        if (cancelled) {
          stopMediaStream(nextStream);
          return;
        }

        setStream((previousStream) => {
          stopMediaStream(previousStream);
          return nextStream;
        });
      } catch (error) {
        setStream((previousStream) => {
          stopMediaStream(previousStream);
          return null;
        });
        onError?.(error instanceof Error ? error.message : onErrorMessage);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      setIsLoading(false);
      stopMediaStream(nextStream);
    };
  }, [isActive, onError, onErrorMessage, startPreview]);

  return { isLoading, stream };
}

export function useCapturePreviewState(
  args: UseCapturePreviewStateArgs,
): UseCapturePreviewStateResult {
  const {
    isMenuActive,
    microphoneEnabled,
    microphoneDeviceId,
    webcamDeviceId,
    displayId,
    onError,
  } = args;
  const [isWebcamPreviewVisible, setWebcamPreviewVisible] = useState(true);
  const [isDesktopPreviewVisible, setDesktopPreviewVisible] = useState(true);

  const microphoneLevel = useMicrophoneLevelMeter({
    isMenuActive,
    microphoneEnabled,
    microphoneDeviceId,
    onError,
  });

  const startWebcamPreview = useCallback(async () => {
    if (!webcamDeviceId) {
      throw new Error("Select a webcam before starting preview.");
    }

    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId: { exact: webcamDeviceId },
      },
    });
  }, [webcamDeviceId]);

  const startDesktopPreview = useCallback(async () => {
    return navigator.mediaDevices.getDisplayMedia({
      audio: false,
      video: true,
    });
  }, []);

  const webcamPreview = usePreviewStream({
    isActive: isMenuActive && isWebcamPreviewVisible && !!webcamDeviceId,
    startPreview: startWebcamPreview,
    onErrorMessage: "Unable to start webcam preview.",
    onError,
  });
  const desktopPreview = usePreviewStream({
    isActive: isMenuActive && isDesktopPreviewVisible && !!displayId,
    startPreview: startDesktopPreview,
    onErrorMessage: "Unable to start desktop preview.",
    onError,
  });

  return {
    microphoneLevel,
    isWebcamPreviewVisible,
    isWebcamPreviewLoading: webcamPreview.isLoading,
    webcamPreviewStream: webcamPreview.stream,
    isDesktopPreviewVisible,
    isDesktopPreviewLoading: desktopPreview.isLoading,
    desktopPreviewStream: desktopPreview.stream,
    setWebcamPreviewVisible,
    setDesktopPreviewVisible,
  };
}
