import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RiCameraLine,
  RiCameraOffLine,
  RiEyeLine,
  RiEyeOffLine,
} from "@remixicon/react";

import { IconToggle } from "../IconToggle";
import { MediaStreamPreview } from "../WebcamPreview";
import { renderDeviceLabel, type WebcamCaptureCardProps } from "./shared";

export function WebcamCaptureCard({
  isBusy,
  webcamDevices,
  webcamEnabled,
  isWebcamPreviewVisible,
  isWebcamPreviewLoading,
  webcamPreviewStream,
  onSetWebcamEnabled,
  onSetWebcamDeviceId,
  onSetWebcamPreviewVisible,
}: WebcamCaptureCardProps) {
  const selectedWebcam = webcamDevices.find((device) => device.isSelected);

  return (
    <div className="flex flex-col gap-4 px-2">
      <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 p-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Camera capture</p>
          <p className="text-xs text-muted-foreground">
            Toggle webcam recording without leaving the current layout.
          </p>
        </div>
        <IconToggle
          pressed={webcamEnabled}
          disabled={isBusy}
          ariaLabel="Enable webcam capture"
          onPressedChange={onSetWebcamEnabled}
          IconActive={RiCameraLine}
          IconInactive={RiCameraOffLine}
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
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border/50 bg-background/35 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Preview</p>
            <p className="text-xs text-muted-foreground">
              Show the active webcam feed before recording starts.
            </p>
          </div>
          <IconToggle
            pressed={isWebcamPreviewVisible}
            disabled={!webcamEnabled || isBusy || webcamDevices.length === 0}
            ariaLabel="Show webcam preview"
            onPressedChange={onSetWebcamPreviewVisible}
            IconActive={RiEyeLine}
            IconInactive={RiEyeOffLine}
          />
        </div>
        <MediaStreamPreview
          stream={isWebcamPreviewVisible ? webcamPreviewStream : null}
          isLoading={isWebcamPreviewVisible && isWebcamPreviewLoading}
          unavailableLabel="Webcam preview hidden"
        />
      </div>
    </div>
  );
}
