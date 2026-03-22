import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { OptionsProps } from "./Options";
import { CaptureOptionsPanel } from "./CaptureOptionsPanel";
import { ShortcutSettingsCard } from "./ShortcutSettingsCard";
import { WindowStatusBadges } from "./WindowStatusBadges";

type OptionsOverviewCardProps = Pick<
  OptionsProps,
  | "statusLabel"
  | "statusVariant"
  | "platformLabel"
  | "windowSizeLabel"
  | "shortcutLabel"
  | "isShortcutEnabled"
  | "onSetShortcutEnabled"
  | "isBusy"
  | "permissions"
  | "microphoneDevices"
  | "webcamDevices"
  | "displays"
  | "microphoneEnabled"
  | "webcamEnabled"
  | "screenEnabled"
  | "systemAudioEnabled"
  | "screenshotEnabled"
  | "microphoneLevel"
  | "isWebcamPreviewVisible"
  | "isWebcamPreviewLoading"
  | "webcamPreviewStream"
  | "isDesktopPreviewVisible"
  | "isDesktopPreviewLoading"
  | "desktopPreviewStream"
  | "hasCaptureSourceEnabled"
  | "onSetMicrophoneEnabled"
  | "onSetWebcamEnabled"
  | "onSetScreenEnabled"
  | "onSetSystemAudioEnabled"
  | "onSetScreenshotEnabled"
  | "onSetMicrophoneDeviceId"
  | "onSetWebcamDeviceId"
  | "onSetDisplayId"
  | "onSetWebcamPreviewVisible"
  | "onSetDesktopPreviewVisible"
  | "onOpenMonitorPicker"
>;

type LocalProps = {
  readonly showPermissions: boolean;
  readonly setShowPermissions: (visible: boolean) => void;
};

export function OptionsOverviewCard({
  statusLabel,
  statusVariant,
  platformLabel,
  windowSizeLabel,
  shortcutLabel,
  isShortcutEnabled,
  onSetShortcutEnabled,
  isBusy,
  permissions,
  microphoneDevices,
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
  onSetWebcamDeviceId,
  onSetDisplayId,
  onSetWebcamPreviewVisible,
  onSetDesktopPreviewVisible,
  onOpenMonitorPicker,
  showPermissions,
  setShowPermissions,
}: OptionsOverviewCardProps & LocalProps) {
  return (
    <Card className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <CardHeader className="flex shrink-0 flex-col gap-1">
        <CardTitle>Options</CardTitle>
        <WindowStatusBadges
          statusLabel={statusLabel}
          statusVariant={statusVariant}
          platformLabel={platformLabel}
          windowSizeLabel={windowSizeLabel}
        />
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <ShortcutSettingsCard
          shortcutLabel={shortcutLabel}
          isShortcutEnabled={isShortcutEnabled}
          isBusy={isBusy}
          onSetShortcutEnabled={onSetShortcutEnabled}
        />

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <p className="text-sm font-medium">Recording sources</p>
          <CaptureOptionsPanel
            isBusy={isBusy}
            microphoneDevices={microphoneDevices}
            webcamDevices={webcamDevices}
            displays={displays}
            permissions={permissions}
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
            onSetWebcamDeviceId={onSetWebcamDeviceId}
            onSetDisplayId={onSetDisplayId}
            onSetWebcamPreviewVisible={onSetWebcamPreviewVisible}
            onSetDesktopPreviewVisible={onSetDesktopPreviewVisible}
            onOpenMonitorPicker={onOpenMonitorPicker}
            showPermissions={showPermissions}
            setShowPermissions={setShowPermissions}
          />
        </div>
      </CardContent>
    </Card>
  );
}
