import { RecordingSandboxCard } from "@/renderer/recording/recording-sandbox-card";
import type { CapturePermissionSnapshot } from "@/shared/capture-options";
import type { RecordingStateSnapshot } from "@/shared/recording";

import { AgentControls } from "./AgentControls";
import { OptionsWorkspace } from "./OptionsWorkspace";
import type { CaptureDeviceOption, CaptureDisplayOption } from "../capture-options/domain";

export type OptionsCardLayout = "controls" | "options" | "sandbox";

export type OptionsProps = {
  readonly layout: OptionsCardLayout;
  readonly statusLabel: string;
  readonly statusVariant: "default" | "secondary" | "outline";
  readonly platformLabel: string;
  readonly windowSizeLabel: string;
  readonly windowBoundsLabel?: string;
  readonly currentSessionId?: string;
  readonly feedbackMessage: string;

  readonly isRecording: boolean;
  readonly isBusy: boolean;
  readonly onToggleRecording: (enabled: boolean) => void;

  readonly shortcutLabel: string;
  readonly isShortcutEnabled: boolean;
  readonly onSetShortcutEnabled: (enabled: boolean) => void;

  readonly recordingState: RecordingStateSnapshot | null;
  readonly onExportRecording?: () => void;

  readonly permissions: CapturePermissionSnapshot | null;
  readonly microphoneDevices: readonly CaptureDeviceOption[];
  readonly audioOutputDevices: readonly CaptureDeviceOption[];
  readonly webcamDevices: readonly CaptureDeviceOption[];
  readonly displays: readonly CaptureDisplayOption[];
  readonly microphoneEnabled: boolean;
  readonly webcamEnabled: boolean;
  readonly screenEnabled: boolean;
  readonly systemAudioEnabled: boolean;
  readonly screenshotEnabled: boolean;
  readonly microphoneLevel: number;
  readonly isWebcamPreviewVisible: boolean;
  readonly isWebcamPreviewLoading: boolean;
  readonly webcamPreviewStream: MediaStream | null;
  readonly isDesktopPreviewVisible: boolean;
  readonly isDesktopPreviewLoading: boolean;
  readonly desktopPreviewStream: MediaStream | null;
  readonly hasCaptureSourceEnabled: boolean;
  readonly onSetMicrophoneEnabled: (enabled: boolean) => void;
  readonly onSetWebcamEnabled: (enabled: boolean) => void;
  readonly onSetScreenEnabled: (enabled: boolean) => void;
  readonly onSetSystemAudioEnabled: (enabled: boolean) => void;
  readonly onSetScreenshotEnabled: (enabled: boolean) => void;
  readonly onSetMicrophoneDeviceId: (deviceId: string) => void;
  readonly onSetAudioOutputDeviceId: (deviceId: string) => void;
  readonly onSetWebcamDeviceId: (deviceId: string) => void;
  readonly onSetDisplayId: (displayId: string) => void;
  readonly onSetWebcamPreviewVisible: (visible: boolean) => void;
  readonly onSetDesktopPreviewVisible: (visible: boolean) => void;
  readonly onOpenMonitorPicker: () => void;
  readonly onOpenRecordingsFolder: () => void;
  readonly onQuit: () => void;
};

export function Options({
  layout,
  statusLabel,
  statusVariant,
  platformLabel,
  windowSizeLabel,
  windowBoundsLabel,
  currentSessionId,
  feedbackMessage,
  isRecording,
  isBusy,
  onToggleRecording,
  shortcutLabel,
  isShortcutEnabled,
  onSetShortcutEnabled,
  recordingState,
  onExportRecording,
  permissions,
  microphoneDevices,
  audioOutputDevices,
  webcamDevices,
  displays,
  microphoneEnabled,
  webcamEnabled,
  screenEnabled,
  systemAudioEnabled,
  screenshotEnabled,
  microphoneLevel,
  isWebcamPreviewVisible,
  isWebcamPreviewLoading,
  webcamPreviewStream,
  isDesktopPreviewVisible,
  isDesktopPreviewLoading,
  desktopPreviewStream,
  hasCaptureSourceEnabled,
  onSetMicrophoneEnabled,
  onSetWebcamEnabled,
  onSetScreenEnabled,
  onSetSystemAudioEnabled,
  onSetScreenshotEnabled,
  onSetMicrophoneDeviceId,
  onSetAudioOutputDeviceId,
  onSetWebcamDeviceId,
  onSetDisplayId,
  onSetWebcamPreviewVisible,
  onSetDesktopPreviewVisible,
  onOpenMonitorPicker,
  onOpenRecordingsFolder,
  onQuit,
}: OptionsProps) {
  const shellClass =
    "flex h-full w-full min-h-0 flex-1 flex-col overflow-hidden from-[#262209] to-[#262209]/30 bg-gradient-to-b  border-2";

  if (layout === "options") {
    return (
      <div className={shellClass}>
        <OptionsWorkspace
          statusLabel={statusLabel}
          statusVariant={statusVariant}
          platformLabel={platformLabel}
          windowSizeLabel={windowSizeLabel}
          windowBoundsLabel={windowBoundsLabel}
          currentSessionId={currentSessionId}
          feedbackMessage={feedbackMessage}
          isRecording={isRecording}
          isBusy={isBusy}
          onToggleRecording={onToggleRecording}
          shortcutLabel={shortcutLabel}
          isShortcutEnabled={isShortcutEnabled}
          onSetShortcutEnabled={onSetShortcutEnabled}
          recordingState={recordingState}
          onExportRecording={onExportRecording}
          permissions={permissions}
          microphoneDevices={microphoneDevices}
          audioOutputDevices={audioOutputDevices}
          webcamDevices={webcamDevices}
          displays={displays}
          microphoneEnabled={microphoneEnabled}
          webcamEnabled={webcamEnabled}
          screenEnabled={screenEnabled}
          systemAudioEnabled={systemAudioEnabled}
          screenshotEnabled={screenshotEnabled}
          microphoneLevel={microphoneLevel}
          isWebcamPreviewVisible={isWebcamPreviewVisible}
          isWebcamPreviewLoading={isWebcamPreviewLoading}
          webcamPreviewStream={webcamPreviewStream}
          isDesktopPreviewVisible={isDesktopPreviewVisible}
          isDesktopPreviewLoading={isDesktopPreviewLoading}
          desktopPreviewStream={desktopPreviewStream}
          hasCaptureSourceEnabled={hasCaptureSourceEnabled}
          onSetMicrophoneEnabled={onSetMicrophoneEnabled}
          onSetWebcamEnabled={onSetWebcamEnabled}
          onSetScreenEnabled={onSetScreenEnabled}
          onSetSystemAudioEnabled={onSetSystemAudioEnabled}
          onSetScreenshotEnabled={onSetScreenshotEnabled}
          onSetMicrophoneDeviceId={onSetMicrophoneDeviceId}
          onSetAudioOutputDeviceId={onSetAudioOutputDeviceId}
          onSetWebcamDeviceId={onSetWebcamDeviceId}
          onSetDisplayId={onSetDisplayId}
          onSetWebcamPreviewVisible={onSetWebcamPreviewVisible}
          onSetDesktopPreviewVisible={onSetDesktopPreviewVisible}
          onOpenMonitorPicker={onOpenMonitorPicker}
          onOpenRecordingsFolder={onOpenRecordingsFolder}
          onQuit={onQuit}
        />
      </div>
    );
  }

  if (layout === "controls") {
    return (
      <div className={shellClass}>
        <AgentControls
          statusLabel={statusLabel}
          statusVariant={statusVariant}
          platformLabel={platformLabel}
          windowSizeLabel={windowSizeLabel}
          windowBoundsLabel={windowBoundsLabel}
          currentSessionId={currentSessionId}
          feedbackMessage={feedbackMessage}
          isRecording={isRecording}
          isBusy={isBusy}
          onToggleRecording={onToggleRecording}
          shortcutLabel={shortcutLabel}
          isShortcutEnabled={isShortcutEnabled}
          onSetShortcutEnabled={onSetShortcutEnabled}
          recordingState={recordingState}
          onExportRecording={onExportRecording}
          permissions={permissions}
          microphoneDevices={microphoneDevices}
          audioOutputDevices={audioOutputDevices}
          webcamDevices={webcamDevices}
          displays={displays}
          microphoneEnabled={microphoneEnabled}
          webcamEnabled={webcamEnabled}
          screenEnabled={screenEnabled}
          systemAudioEnabled={systemAudioEnabled}
          screenshotEnabled={screenshotEnabled}
          microphoneLevel={microphoneLevel}
          isWebcamPreviewVisible={isWebcamPreviewVisible}
          isWebcamPreviewLoading={isWebcamPreviewLoading}
          webcamPreviewStream={webcamPreviewStream}
          isDesktopPreviewVisible={isDesktopPreviewVisible}
          isDesktopPreviewLoading={isDesktopPreviewLoading}
          desktopPreviewStream={desktopPreviewStream}
          hasCaptureSourceEnabled={hasCaptureSourceEnabled}
          onSetMicrophoneEnabled={onSetMicrophoneEnabled}
          onSetWebcamEnabled={onSetWebcamEnabled}
          onSetScreenEnabled={onSetScreenEnabled}
          onSetSystemAudioEnabled={onSetSystemAudioEnabled}
          onSetScreenshotEnabled={onSetScreenshotEnabled}
          onSetMicrophoneDeviceId={onSetMicrophoneDeviceId}
          onSetAudioOutputDeviceId={onSetAudioOutputDeviceId}
          onSetWebcamDeviceId={onSetWebcamDeviceId}
          onSetDisplayId={onSetDisplayId}
          onSetWebcamPreviewVisible={onSetWebcamPreviewVisible}
          onSetDesktopPreviewVisible={onSetDesktopPreviewVisible}
          onOpenMonitorPicker={onOpenMonitorPicker}
          onOpenRecordingsFolder={onOpenRecordingsFolder}
          onQuit={onQuit}
        />
      </div>
    );
  }
  if (layout === "sandbox") {
    return <RecordingSandboxCard />;
  }

  return null;
}

