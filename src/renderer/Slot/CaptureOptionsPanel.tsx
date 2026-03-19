import type { CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { CapturePermissionSnapshot } from "@/shared/capture-options";

import type {
  CaptureDeviceOption,
  CaptureDisplayOption,
} from "../capture-options/domain";
import { MediaStreamPreview } from "./WebcamPreview";
import { cn } from "@/lib/utils";

type CaptureOptionsPanelProps = {
  readonly isBusy: boolean;
  readonly microphoneDevices: readonly CaptureDeviceOption[];
  readonly webcamDevices: readonly CaptureDeviceOption[];
  readonly displays: readonly CaptureDisplayOption[];
  readonly permissions: CapturePermissionSnapshot | null;
  readonly microphoneEnabled: boolean;
  readonly webcamEnabled: boolean;
  readonly screenEnabled: boolean;
  readonly systemAudioEnabled: boolean;
  readonly screenshotEnabled: boolean;
  readonly microphoneLevel: number;
  readonly isWebcamPreviewVisible: boolean;
  readonly webcamPreviewStream: MediaStream | null;
  readonly isDesktopPreviewVisible: boolean;
  readonly desktopPreviewStream: MediaStream | null;
  readonly hasCaptureSourceEnabled: boolean;
  readonly onSetMicrophoneEnabled: (enabled: boolean) => void;
  readonly onSetWebcamEnabled: (enabled: boolean) => void;
  readonly onSetScreenEnabled: (enabled: boolean) => void;
  readonly onSetSystemAudioEnabled: (enabled: boolean) => void;
  readonly onSetScreenshotEnabled: (enabled: boolean) => void;
  readonly onSetMicrophoneDeviceId: (deviceId: string) => void;
  readonly onSetWebcamDeviceId: (deviceId: string) => void;
  readonly onSetDisplayId: (displayId: string) => void;
  readonly onSetWebcamPreviewVisible: (visible: boolean) => void;
  readonly onSetDesktopPreviewVisible: (visible: boolean) => void;
  readonly onOpenMonitorPicker: () => void;
  showPermissions: boolean;
  setShowPermissions: (visible: boolean) => void
};

function getPermissionVariant(status: string): "default" | "outline" | "destructive" {
  if (status === "granted") {
    return "default";
  }

  if (status === "denied" || status === "restricted") {
    return "destructive";
  }

  return "outline";
}

function renderDeviceLabel(device: CaptureDeviceOption): string {
  const suffixes = [];

  if (device.isDefault) {
    suffixes.push("default");
  }

  if (device.isActive) {
    suffixes.push("active");
  }

  if (suffixes.length === 0) {
    return device.label;
  }

  return `${device.label} (${suffixes.join(", ")})`;
}

export function CaptureOptionsPanel({
  isBusy,
  microphoneDevices,
  webcamDevices,
  displays,
  permissions,
  microphoneEnabled,
  webcamEnabled,
  screenEnabled,
  systemAudioEnabled,
  screenshotEnabled,
  microphoneLevel,
  isWebcamPreviewVisible,
  webcamPreviewStream,
  isDesktopPreviewVisible,
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
  showPermissions = false,
  setShowPermissions,
}: CaptureOptionsPanelProps) {
  const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;
  const selectedMicrophone = microphoneDevices.find((device) => device.isSelected);
  const selectedWebcam = webcamDevices.find((device) => device.isSelected);
  const selectedDisplay = displays.find((display) => display.isSelected);
  return (
    <div className="flex flex-col gap-3" style={noDragStyle}>
      <div className={cn("flex flex-wrap gap-2", showPermissions ? "block" : "hidden")} onClick={() => setShowPermissions(!showPermissions)}>
        <Badge variant={permissions ? getPermissionVariant(permissions.microphone) : "outline"}>
          Mic {permissions?.microphone ?? "unknown"}
        </Badge>
        <Badge variant={permissions ? getPermissionVariant(permissions.camera) : "outline"}>
          Camera {permissions?.camera ?? "unknown"}
        </Badge>
        <Badge variant={permissions ? getPermissionVariant(permissions.screen) : "outline"}>
          Screen {permissions?.screen ?? "unknown"}
        </Badge>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border/50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Microphone</p>
            <p className="text-xs text-muted-foreground">
              Preview metering runs while the options view is active.
            </p>
          </div>
          <Switch
            checked={microphoneEnabled}
            disabled={isBusy}
            aria-label="Enable microphone capture"
            onCheckedChange={onSetMicrophoneEnabled}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="microphone-select" id="microphone-select">Input device</Label>
          <Select

            value={selectedMicrophone?.deviceId}
            onValueChange={onSetMicrophoneDeviceId}
            disabled={!microphoneEnabled || isBusy || microphoneDevices.length === 0}
          >
            <SelectTrigger id="microphone-select" className="w-full">
              <SelectValue placeholder="Select microphone" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {microphoneDevices.map((device) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {renderDeviceLabel(device)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-3">
            <Progress value={microphoneEnabled ? microphoneLevel : 0} className="flex-1" />
            <span className="w-10 text-right text-xs text-muted-foreground">
              {microphoneEnabled ? `${microphoneLevel}%` : "off"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border/50 bg-background/35 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="webcam-select" id="webcam-select">Webcam</label>

          </div>
          {/* add collapsible panel with the webcam preview */}
          <Switch
            checked={webcamEnabled}
            disabled={isBusy}
            aria-label="Enable webcam capture"
            onCheckedChange={onSetWebcamEnabled}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="webcam-select">Camera device</Label>
          <Select
            value={selectedWebcam?.deviceId}
            onValueChange={onSetWebcamDeviceId}
            disabled={!webcamEnabled || isBusy || webcamDevices.length === 0}
          >
            <SelectTrigger id="webcam-select" className="w-full">
              <SelectValue placeholder="Select camera" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {webcamDevices.map((device) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {renderDeviceLabel(device)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Preview</Label>
              <Switch
                checked={isWebcamPreviewVisible}
                disabled={!webcamEnabled || isBusy || webcamDevices.length === 0}
                aria-label="Show webcam preview"
                onCheckedChange={onSetWebcamPreviewVisible}
              />
            </div>
            <MediaStreamPreview
              stream={isWebcamPreviewVisible ? webcamPreviewStream : null}
              unavailableLabel="Webcam preview hidden"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border/50 bg-background/35 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Display capture</p>
            <p className="text-xs text-muted-foreground">
              Screen recording and system audio share the selected monitor target.
            </p>
          </div>
          <Switch
            checked={screenEnabled}
            disabled={isBusy}
            aria-label="Enable screen capture"
            onCheckedChange={onSetScreenEnabled}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <Label>Selected monitor</Label>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={isBusy || displays.length === 0}
              onClick={onOpenMonitorPicker}
            >
              Pick source
            </Button>
          </div>
          <RadioGroup
            value={selectedDisplay?.displayId}
            onValueChange={onSetDisplayId}
            className="gap-2"
          >
            {displays.map((display) => (
              <div
                key={display.displayId}
                className="flex items-start gap-3 rounded-md border border-border/50 bg-background/40 p-2"
              >
                <RadioGroupItem
                  value={display.displayId}
                  id={`display-${display.displayId}`}
                  disabled={isBusy}
                />
                <Label
                  htmlFor={`display-${display.displayId}`}
                  className="flex flex-1 flex-col gap-1 text-left"
                >
                  <span>{display.label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {display.bounds.width} x {display.bounds.height}
                    {display.isPrimary ? " • primary" : ""}
                    {display.isActive ? " • active" : ""}
                  </span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="flex flex-col gap-2 max-w-1/2">
          <div className="flex items-center justify-between gap-3">
            <Label>Desktop preview</Label>
            <Switch
              checked={isDesktopPreviewVisible}
              disabled={!screenEnabled || isBusy || displays.length === 0}
              aria-label="Show desktop preview"
              onCheckedChange={onSetDesktopPreviewVisible}
            />
          </div>
          {/* add collapsible panel with the desktop preview */}
          <MediaStreamPreview
            stream={isDesktopPreviewVisible ? desktopPreviewStream : null}
            unavailableLabel="Desktop preview hidden"
          />
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/40 p-2">
            <Label htmlFor="system-audio-switch">System audio</Label>
            <Switch
              id="system-audio-switch"
              checked={systemAudioEnabled}
              disabled={isBusy}
              onCheckedChange={onSetSystemAudioEnabled}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/40 p-2">
            <Label htmlFor="screenshot-switch">Screenshots</Label>
            <Switch
              id="screenshot-switch"
              checked={screenshotEnabled}
              disabled={isBusy}
              onCheckedChange={onSetScreenshotEnabled}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/40 p-2">
            <span className="text-xs text-muted-foreground">
              {hasCaptureSourceEnabled ? "At least one source enabled" : "Enable a source to record"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
