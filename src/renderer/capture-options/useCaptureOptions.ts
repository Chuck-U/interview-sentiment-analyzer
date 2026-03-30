import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  loadCaptureOptions,
  optimisticSetConfig,
  persistCaptureConfig,
} from "@/renderer/store/slices/captureOptionsSlice";
import type {
  CaptureOptionsConfig,
  CapturePermissionSnapshot,
} from "@/shared/capture-options";
import type { MediaChunkSource } from "@/shared/session-lifecycle";

import { useAppDispatch, useAppSelector } from "../store/hooks";

import {
  buildCaptureSourcesFromConfig,
  buildDeviceOptions,
  buildDisplayOptions,
  getActiveDisplayId,
  getActiveMicrophoneDeviceId,
  getActiveWebcamDeviceId,
  reconcileCaptureOptionsConfig,
} from "./domain";
import { useCapturePreviewState } from "./useCapturePreviewState";

import { isNonEmptyObject, isNonEmptyString } from "@/backend/guards/checks";

type UseCaptureOptionsArgs = {
  readonly isMenuActive: boolean;
  readonly onError?: (message: string) => void;
};

type UseCaptureOptionsResult = {
  readonly config: CaptureOptionsConfig;
  readonly permissions: CapturePermissionSnapshot | null;
  readonly microphoneDevices: ReturnType<typeof buildDeviceOptions>;
  readonly audioOutputDevices: ReturnType<typeof buildDeviceOptions>;
  readonly webcamDevices: ReturnType<typeof buildDeviceOptions>;
  readonly displays: ReturnType<typeof buildDisplayOptions>;
  readonly microphoneLevel: number;
  readonly isWebcamPreviewVisible: boolean;
  readonly isWebcamPreviewLoading: boolean;
  readonly webcamPreviewStream: MediaStream | null;
  readonly isDesktopPreviewVisible: boolean;
  readonly isDesktopPreviewLoading: boolean;
  readonly desktopPreviewStream: MediaStream | null;
  readonly hasCaptureSourceEnabled: boolean;
  readonly refresh: () => Promise<void>;
  readonly setMicrophoneEnabled: (enabled: boolean) => void;
  readonly setWebcamEnabled: (enabled: boolean) => void;
  readonly setScreenEnabled: (enabled: boolean) => void;
  readonly setSystemAudioEnabled: (enabled: boolean) => void;
  readonly setScreenshotEnabled: (enabled: boolean) => void;
  readonly setMicrophoneDeviceId: (deviceId: string) => void;
  readonly setAudioOutputDeviceId: (deviceId: string) => void;
  readonly setWebcamDeviceId: (deviceId: string) => void;
  readonly setDisplayId: (displayId: string) => void;
  readonly setWebcamPreviewVisible: (visible: boolean) => void;
  readonly setDesktopPreviewVisible: (visible: boolean) => void;
  readonly openMonitorPicker: () => Promise<void>;
  readonly captureSources: readonly MediaChunkSource[];
};

export function useCaptureOptions(
  args: UseCaptureOptionsArgs,
): UseCaptureOptionsResult {
  const { isMenuActive, onError } = args;
  const dispatch = useAppDispatch();

  const config = useAppSelector((state) => state.captureOptions.config);
  const permissions = useAppSelector((state) => state.captureOptions.permissions);
  const devices = useAppSelector((state) => state.captureOptions.devices);
  const displays = useAppSelector((state) => state.captureOptions.displays);
  const recordingState = useAppSelector(
    (state) => state.sessionRecording.recordingState,
  );

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
      dispatch(optimisticSetConfig(nextConfig));

      try {
        await dispatch(
          persistCaptureConfig({ nextConfig, previousConfig }),
        ).unwrap();
      } catch (error: unknown) {

        if (isNonEmptyObject(error) && isNonEmptyString(error.message)) {
          onError?.(error.message);
          return;
        }

        onError?.("Unable to save capture options.");
      }
    },
    [dispatch, onError],
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
      await dispatch(loadCaptureOptions()).unwrap();
    } catch (error) {
      onError?.(
        typeof error === "string"
          ? error
          : "Unable to load capture options.",
      );
    }
  }, [dispatch, onError]);

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

  const previewState = useCapturePreviewState({
    isMenuActive,
    microphoneEnabled: config.microphone.enabled,
    microphoneDeviceId: config.microphone.deviceId,
    webcamDeviceId: config.webcam.deviceId,
    displayId: config.display.displayId,
    onError,
  });

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

  const audioOutputDevices = useMemo(
    () =>
      buildDeviceOptions({
        devices,
        kind: "audiooutput",
        selectedDeviceId: config.systemAudio.deviceId,
      }),
    [config.systemAudio.deviceId, devices],
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
    audioOutputDevices,
    webcamDevices,
    displays: displayOptions,
    microphoneLevel: previewState.microphoneLevel,
    isWebcamPreviewVisible: previewState.isWebcamPreviewVisible,
    isWebcamPreviewLoading: previewState.isWebcamPreviewLoading,
    webcamPreviewStream: previewState.webcamPreviewStream,
    isDesktopPreviewVisible: previewState.isDesktopPreviewVisible,
    isDesktopPreviewLoading: previewState.isDesktopPreviewLoading,
    desktopPreviewStream: previewState.desktopPreviewStream,
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
          ...current.systemAudio,
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
    setAudioOutputDeviceId(deviceId) {
      applyConfigUpdate((current) => ({
        ...current,
        systemAudio: {
          ...current.systemAudio,
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
      previewState.setWebcamPreviewVisible(visible);
    },
    setDesktopPreviewVisible(visible) {
      previewState.setDesktopPreviewVisible(visible);
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
