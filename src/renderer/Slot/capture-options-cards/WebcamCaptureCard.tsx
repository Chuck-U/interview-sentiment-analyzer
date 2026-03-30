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
  RiCameraOffLine,
  RiEyeLine,
  RiEyeOffLine,
  RiWebcamLine,
} from "@remixicon/react";

import { IconToggle } from "../IconToggle";
import { MediaStreamPreview } from "../WebcamPreview";
import { renderDeviceLabel, type WebcamCaptureCardProps } from "./shared";
import { cn } from "@/lib/utils";

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
    <div className="flex flex-col gap-4 px-2 my-4">
      <div className="flex items-center justify-between gap-3 rounded-md border border-border/50">
        <div className="flex flex-row justify-between w-full">
          <span className="flex flex-col justify-start">
            <p className="text-[14px] font-medium flex">Camera capture</p>
            <p className="text-[12px] text-muted-foreground">
              {webcamEnabled ? "Disable" : "Enable"} Webcam Capture
            </p>
          </span>


          <IconToggle
            pressed={webcamEnabled}
            disabled={isBusy}
            ariaLabel={webcamEnabled ? "Disable webcam capture" : "Enable webcam capture"}
            onPressedChange={onSetWebcamEnabled}
            IconActive={RiWebcamLine}
            IconInactive={RiCameraOffLine}
            className={cn(webcamEnabled ? "text-muted-foreground hover:ring-accent/10" : "text-red-300 hover:text-muted-foreground", "hover:ring-accent/10 data-[state=on]:bg-transparent data-[state=on]:!text-red-300")}
          />
        </div>
      </div>


      {webcamEnabled && (
        <>
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
        </>
      )}
      <br />
    </div>
  );
}
