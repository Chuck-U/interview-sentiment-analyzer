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
  RiForbid2Line,
  RiScreenshotLine,
  RiVolumeMuteLine,
  RiVolumeUpLine,
} from "@remixicon/react";

import { IconToggle } from "../IconToggle";
import { renderDeviceLabel, type SystemCaptureOptionsCardProps } from "./shared";

export function SystemCaptureOptionsCard({
  audioOutputDevices,
  isBusy,
  systemAudioEnabled,
  screenshotEnabled,
  hasCaptureSourceEnabled,
  onSetAudioOutputDeviceId,
  onSetSystemAudioEnabled,
  onSetScreenshotEnabled,
}: SystemCaptureOptionsCardProps) {
  const selectedAudioOutput = audioOutputDevices.find((device) => device.isSelected);

  return (
    <>
      <div className="">
        <div className="flex flex-col gap-1">
          <Label htmlFor="system-audio-switch">System audio</Label>
          <p className="text-xs text-muted-foreground">
            Record desktop audio alongside the selected display when available.
          </p>
        </div>
        <IconToggle
          id="system-audio-switch"
          pressed={systemAudioEnabled}
          disabled={isBusy}
          ariaLabel="Toggle system audio capture"
          onPressedChange={onSetSystemAudioEnabled}
          IconActive={RiVolumeUpLine}
          IconInactive={RiVolumeMuteLine}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="audio-output-select">Output device</Label>
        <Select
          value={selectedAudioOutput?.deviceId}
          onValueChange={onSetAudioOutputDeviceId}
          disabled={!systemAudioEnabled || isBusy || audioOutputDevices.length === 0}
        >
          <SelectTrigger id="audio-output-select" className="w-full">
            <SelectValue placeholder="Select output device" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {audioOutputDevices.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {renderDeviceLabel(device)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Select which output device should be associated with desktop audio capture.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/40 p-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="screenshot-switch">Screenshots</Label>
          <p className="text-xs text-muted-foreground">
            Capture screenshots in parallel with the enabled recording sources.
          </p>
        </div>
        <IconToggle
          id="screenshot-switch"
          pressed={screenshotEnabled}
          disabled={isBusy}
          ariaLabel="Toggle screenshot capture"
          onPressedChange={onSetScreenshotEnabled}
          IconActive={RiScreenshotLine}
          IconInactive={RiForbid2Line}
        />
      </div>

      <div className="rounded-md border border-border/50 bg-background/35 p-3 text-xs text-muted-foreground">
        {hasCaptureSourceEnabled
          ? "At least one source is enabled and ready to record."
          : "Enable at least one source before starting a recording."}
      </div>
    </>
  );
}
