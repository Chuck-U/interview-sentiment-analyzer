import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_CAPTURE_OPTIONS_CONFIG,
  type CaptureDeviceKind,
  type CaptureDeviceSnapshot,
  type CaptureDisplaySnapshot,
  type CaptureOptionsConfig,
  type CapturePermissionSnapshot,
} from "@/shared/capture-options";
import type { RecordingStateSnapshot } from "@/shared/recording";
import type { MediaChunkSource } from "@/shared/session-lifecycle";

import {
  buildCaptureSourcesFromConfig,
  buildDeviceOptions,
  buildDisplayOptions,
  getActiveDisplayId,
  getActiveMicrophoneDeviceId,
  getActiveWebcamDeviceId,
  reconcileCaptureOptionsConfig,
} from "./domain";

type UseCaptureOptionsArgs = {
  readonly isMenuActive: boolean;
  readonly recordingState: RecordingStateSnapshot | null;
  readonly onError?: (message: string) => void;
};

type UseCaptureOptionsResult = {
  readonly config: CaptureOptionsConfig;
  readonly permissions: CapturePermissionSnapshot | null;
  readonly microphoneDevices: ReturnType<typeof buildDeviceOptions>;
  readonly webcamDevices: ReturnType<typeof buildDeviceOptions>;
  readonly displays: ReturnType<typeof buildDisplayOptions>;
  readonly microphoneLevel: number;
  readonly isWebcamPreviewVisible: boolean;
  readonly webcamPreviewStream: MediaStream | null;
  readonly isDesktopPreviewVisible: boolean;
  readonly desktopPreviewStream: MediaStream | null;
  readonly hasCaptureSourceEnabled: boolean;
  readonly refresh: () => Promise<void>;
  readonly setMicrophoneEnabled: (enabled: boolean) => void;
  readonly setWebcamEnabled: (enabled: boolean) => void;
  readonly setScreenEnabled: (enabled: boolean) => void;
  readonly setSystemAudioEnabled: (enabled: boolean) => void;
  readonly setScreenshotEnabled: (enabled: boolean) => void;
  readonly setMicrophoneDeviceId: (deviceId: string) => void;
  readonly setWebcamDeviceId: (deviceId: string) => void;
  readonly setDisplayId: (displayId: string) => void;
  readonly setWebcamPreviewVisible: (visible: boolean) => void;
  readonly setDesktopPreviewVisible: (visible: boolean) => void;
  readonly openMonitorPicker: () => Promise<void>;
  readonly captureSources: readonly MediaChunkSource[];
};

function buildFallbackLabel(
  kind: CaptureDeviceKind,
  index: number,
  isDefault: boolean,
): string {
  if (kind === "audioinput") {
    return isDefault ? "Default microphone" : `Microphone ${index + 1}`;
  }

  return isDefault ? "Default camera" : `Camera ${index + 1}`;
}

function normalizeDevices(
  devices: readonly MediaDeviceInfo[],
): readonly CaptureDeviceSnapshot[] {
  const filtered = devices.filter(
    (device): device is MediaDeviceInfo & { kind: CaptureDeviceKind } =>
      device.kind === "audioinput" || device.kind === "videoinput",
  );

  const firstDeviceIndexByKind = new Map<CaptureDeviceKind, number>();

  return filtered.map((device, index) => {
    if (!firstDeviceIndexByKind.has(device.kind)) {
      firstDeviceIndexByKind.set(device.kind, index);
    }

    const isDefault = firstDeviceIndexByKind.get(device.kind) === index;

    return {
      kind: device.kind,
      deviceId: device.deviceId,
      label: device.label || buildFallbackLabel(device.kind, index, isDefault),
      groupId: device.groupId || undefined,
      isDefault,
    };
  });
}

function configsEqual(a: CaptureOptionsConfig, b: CaptureOptionsConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useCaptureOptions(
  args: UseCaptureOptionsArgs,
): UseCaptureOptionsResult {
  const { isMenuActive, onError, recordingState } = args;
  const [config, setConfig] = useState<CaptureOptionsConfig>(
    DEFAULT_CAPTURE_OPTIONS_CONFIG,
  );
  const [permissions, setPermissions] =
    useState<CapturePermissionSnapshot | null>(null);
  const [devices, setDevices] = useState<readonly CaptureDeviceSnapshot[]>([]);
  const [displays, setDisplays] = useState<readonly CaptureDisplaySnapshot[]>([]);
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [isWebcamPreviewVisible, setIsWebcamPreviewVisible] = useState(false);
  const [webcamPreviewStream, setWebcamPreviewStream] =
    useState<MediaStream | null>(null);
  const [isDesktopPreviewVisible, setIsDesktopPreviewVisible] = useState(false);
  const [desktopPreviewStream, setDesktopPreviewStream] =
    useState<MediaStream | null>(null);

  const configRef = useRef(config);
  const devicesRef = useRef(devices);
  const displaysRef = useRef(displays);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  useEffect(() => {
    displaysRef.current = displays;
  }, [displays]);

  const persistConfig = useCallback(
    async (nextConfig: CaptureOptionsConfig, previousConfig: CaptureOptionsConfig) => {
      setConfig(nextConfig);

      try {
        const savedConfig = await window.electronApp.captureOptions.setConfig(
          nextConfig,
        );
        setConfig(savedConfig);
      } catch (error) {
        setConfig(previousConfig);
        onError?.(
          error instanceof Error
            ? error.message
            : "Unable to save capture options.",
        );
      }
    },
    [onError],
  );

  const applyConfigUpdate = useCallback(
    (updater: (current: CaptureOptionsConfig) => CaptureOptionsConfig) => {
      const previousConfig = configRef.current;
      const nextConfig = reconcileCaptureOptionsConfig({
        config: updater(previousConfig),
        devices: devicesRef.current,
        displays: displaysRef.current,
      });

      void persistConfig(nextConfig, previousConfig);
    },
    [persistConfig],
  );

  const refresh = useCallback(async () => {
    try {
      const [savedConfig, savedPermissions, displaySnapshots, deviceInfos] =
        await Promise.all([
          window.electronApp.captureOptions.getConfig(),
          window.electronApp.captureOptions.getPermissions(),
          window.electronApp.captureOptions.listDisplays(),
          navigator.mediaDevices.enumerateDevices(),
        ]);

      const normalizedDevices = normalizeDevices(deviceInfos);
      const reconciledConfig = reconcileCaptureOptionsConfig({
        config: savedConfig,
        devices: normalizedDevices,
        displays: displaySnapshots,
      });

      setPermissions(savedPermissions);
      setDevices(normalizedDevices);
      setDisplays(displaySnapshots);
      setConfig(reconciledConfig);

      if (!configsEqual(savedConfig, reconciledConfig)) {
        await window.electronApp.captureOptions.setConfig(reconciledConfig);
      }
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : "Unable to load capture options.",
      );
    }
  }, [onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) {
      return;
    }

    const handleDeviceChange = () => {
      void refresh();
    };

    mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [refresh]);

  useEffect(() => {
    return window.electronApp.captureOptions.onSelectedDisplayChanged((event) => {
      if (!event.displayId) {
        return;
      }

      const display = displaysRef.current.find(
        (item) => item.displayId === event.displayId,
      );

      applyConfigUpdate((current) => ({
        ...current,
        display: {
          displayId: event.displayId,
          label: display?.label,
        },
      }));
    });
  }, [applyConfigUpdate]);

  useEffect(() => {
    if (!isMenuActive || !config.microphone.enabled) {
      setMicrophoneLevel(0);
      return;
    }

    let cancelled = false;
    let animationFrameId = 0;
    let audioContext: AudioContext | null = null;
    let previewStream: MediaStream | null = null;

    const startMeter = async () => {
      try {
        previewStream = await navigator.mediaDevices.getUserMedia({
          audio: config.microphone.deviceId
            ? {
                deviceId: { exact: config.microphone.deviceId },
              }
            : true,
          video: false,
        });

        if (cancelled) {
          for (const track of previewStream.getTracks()) {
            track.stop();
          }
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

      if (previewStream) {
        for (const track of previewStream.getTracks()) {
          track.stop();
        }
      }

      if (audioContext) {
        void audioContext.close();
      }
    };
  }, [config.microphone.deviceId, config.microphone.enabled, isMenuActive, onError]);

  useEffect(() => {
    const selectedWebcamId = config.webcam.deviceId;

    if (!isMenuActive || !isWebcamPreviewVisible || !selectedWebcamId) {
      setWebcamPreviewStream((previousStream) => {
        if (previousStream) {
          for (const track of previousStream.getTracks()) {
            track.stop();
          }
        }

        return null;
      });
      return;
    }

    let cancelled = false;
    let nextStream: MediaStream | null = null;

    const startPreview = async () => {
      try {
        nextStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            deviceId: { exact: selectedWebcamId },
          },
        });

        if (cancelled) {
          for (const track of nextStream.getTracks()) {
            track.stop();
          }
          return;
        }

        setWebcamPreviewStream((previousStream) => {
          if (previousStream) {
            for (const track of previousStream.getTracks()) {
              track.stop();
            }
          }

          return nextStream;
        });
      } catch (error) {
        setWebcamPreviewStream((previousStream) => {
          if (previousStream) {
            for (const track of previousStream.getTracks()) {
              track.stop();
            }
          }

          return null;
        });
        onError?.(
          error instanceof Error
            ? error.message
            : "Unable to start webcam preview.",
        );
      }
    };

    void startPreview();

    return () => {
      cancelled = true;

      if (nextStream) {
        for (const track of nextStream.getTracks()) {
          track.stop();
        }
      }
    };
  }, [config.webcam.deviceId, isMenuActive, isWebcamPreviewVisible, onError]);

  useEffect(() => {
    const selectedDisplayId = config.display.displayId;

    if (!isMenuActive || !isDesktopPreviewVisible || !selectedDisplayId) {
      setDesktopPreviewStream((previousStream) => {
        if (previousStream) {
          for (const track of previousStream.getTracks()) {
            track.stop();
          }
        }

        return null;
      });
      return;
    }

    let cancelled = false;
    let nextStream: MediaStream | null = null;

    const startPreview = async () => {
      try {
        nextStream = await navigator.mediaDevices.getDisplayMedia({
          audio: false,
          video: true,
        });

        if (cancelled) {
          for (const track of nextStream.getTracks()) {
            track.stop();
          }
          return;
        }

        setDesktopPreviewStream((previousStream) => {
          if (previousStream) {
            for (const track of previousStream.getTracks()) {
              track.stop();
            }
          }

          return nextStream;
        });
      } catch (error) {
        setDesktopPreviewStream((previousStream) => {
          if (previousStream) {
            for (const track of previousStream.getTracks()) {
              track.stop();
            }
          }

          return null;
        });
        onError?.(
          error instanceof Error
            ? error.message
            : "Unable to start desktop preview.",
        );
      }
    };

    void startPreview();

    return () => {
      cancelled = true;

      if (nextStream) {
        for (const track of nextStream.getTracks()) {
          track.stop();
        }
      }
    };
  }, [config.display.displayId, isDesktopPreviewVisible, isMenuActive, onError]);

  const activeMicrophoneDeviceId = getActiveMicrophoneDeviceId(recordingState);
  const activeWebcamDeviceId = getActiveWebcamDeviceId(recordingState);
  const activeDisplayId = getActiveDisplayId(recordingState);

  const microphoneDevices = useMemo(
    () =>
      buildDeviceOptions({
        devices,
        kind: "audioinput",
        selectedDeviceId: config.microphone.deviceId,
        activeDeviceId: activeMicrophoneDeviceId,
      }),
    [activeMicrophoneDeviceId, config.microphone.deviceId, devices],
  );

  const webcamDevices = useMemo(
    () =>
      buildDeviceOptions({
        devices,
        kind: "videoinput",
        selectedDeviceId: config.webcam.deviceId,
        activeDeviceId: activeWebcamDeviceId,
      }),
    [activeWebcamDeviceId, config.webcam.deviceId, devices],
  );

  const displayOptions = useMemo(
    () =>
      buildDisplayOptions({
        displays,
        selectedDisplayId: config.display.displayId,
        activeDisplayId,
      }),
    [activeDisplayId, config.display.displayId, displays],
  );

  const captureSources = useMemo(
    () => buildCaptureSourcesFromConfig(config),
    [config],
  );

  return {
    config,
    permissions,
    microphoneDevices,
    webcamDevices,
    displays: displayOptions,
    microphoneLevel,
    isWebcamPreviewVisible,
    webcamPreviewStream,
    isDesktopPreviewVisible,
    desktopPreviewStream,
    hasCaptureSourceEnabled: captureSources.length > 0,
    refresh,
    setMicrophoneEnabled(enabled) {
      applyConfigUpdate((current) => ({
        ...current,
        microphone: {
          ...current.microphone,
          enabled,
        },
      }));
    },
    setWebcamEnabled(enabled) {
      applyConfigUpdate((current) => ({
        ...current,
        webcam: {
          ...current.webcam,
          enabled,
        },
      }));
    },
    setScreenEnabled(enabled) {
      applyConfigUpdate((current) => ({
        ...current,
        screen: {
          enabled,
        },
      }));
    },
    setSystemAudioEnabled(enabled) {
      applyConfigUpdate((current) => ({
        ...current,
        systemAudio: {
          enabled,
        },
      }));
    },
    setScreenshotEnabled(enabled) {
      applyConfigUpdate((current) => ({
        ...current,
        screenshot: {
          enabled,
        },
      }));
    },
    setMicrophoneDeviceId(deviceId) {
      applyConfigUpdate((current) => ({
        ...current,
        microphone: {
          ...current.microphone,
          deviceId,
          label: devicesRef.current.find((device) => device.deviceId === deviceId)
            ?.label,
        },
      }));
    },
    setWebcamDeviceId(deviceId) {
      applyConfigUpdate((current) => ({
        ...current,
        webcam: {
          ...current.webcam,
          deviceId,
          label: devicesRef.current.find((device) => device.deviceId === deviceId)
            ?.label,
        },
      }));
    },
    setDisplayId(displayId) {
      applyConfigUpdate((current) => ({
        ...current,
        display: {
          displayId,
          label: displaysRef.current.find((display) => display.displayId === displayId)
            ?.label,
        },
      }));
    },
    setWebcamPreviewVisible(visible) {
      setIsWebcamPreviewVisible(visible);
    },
    setDesktopPreviewVisible(visible) {
      setIsDesktopPreviewVisible(visible);
    },
    async openMonitorPicker() {
      try {
        await window.electronApp.captureOptions.openMonitorPicker({
          selectedDisplayId: configRef.current.display.displayId,
        });
      } catch (error) {
        onError?.(
          error instanceof Error
            ? error.message
            : "Unable to open monitor picker.",
        );
      }
    },
    captureSources,
  };
}
