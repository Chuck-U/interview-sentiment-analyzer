import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

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
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="border-b">
        <CardTitle>Webcam</CardTitle>
        <CardDescription>
          Choose a camera and keep a live preview visible while configuring capture.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 py-1">
        <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/35 p-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Camera capture</p>
            <p className="text-xs text-muted-foreground">
              Toggle webcam recording without leaving the current layout.
            </p>
          </div>
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
        </div>

        <div className="flex flex-col gap-2 rounded-md border border-border/50 bg-background/35 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Preview</p>
              <p className="text-xs text-muted-foreground">
                Show the active webcam feed before recording starts.
              </p>
            </div>
            <Switch
              checked={isWebcamPreviewVisible}
              disabled={!webcamEnabled || isBusy || webcamDevices.length === 0}
              aria-label="Show webcam preview"
              onCheckedChange={onSetWebcamPreviewVisible}
            />
          </div>
          <MediaStreamPreview
            stream={isWebcamPreviewVisible ? webcamPreviewStream : null}
            isLoading={isWebcamPreviewVisible && isWebcamPreviewLoading}
            unavailableLabel="Webcam preview hidden"
          />
        </div>
      </CardContent>
    </Card>
  );
}
