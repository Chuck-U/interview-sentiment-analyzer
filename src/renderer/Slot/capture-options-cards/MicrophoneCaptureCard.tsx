import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RiMicLine, RiMicOffLine } from "@remixicon/react";

import { IconToggle } from "../IconToggle";
import {
  renderDeviceLabel,
  type MicrophoneCaptureCardProps,
} from "./shared";

export function MicrophoneCaptureCard({
  isBusy,
  microphoneDevices,
  microphoneEnabled,
  microphoneLevel,
  onSetMicrophoneEnabled,
  onSetMicrophoneDeviceId,
}: MicrophoneCaptureCardProps) {
  const selectedMicrophone = microphoneDevices.find((device) => device.isSelected);

  return (
    <div className="flex flex-col gap-4 px-2 my-4 [&>*:nth-child(odd)]:bg-background/35 [&>*:nth-child(odd)]:rounded-md">
      <div className="flex items-center justify-between gap-3 rounded-md border p-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Capture input</p>
          <p className="text-xs text-muted-foreground">
            Enable the microphone to meter levels and record spoken audio.
          </p>
        </div>
        <IconToggle
          pressed={microphoneEnabled}
          disabled={isBusy}
          ariaLabel="Enable microphone capture"
          onPressedChange={onSetMicrophoneEnabled}
          IconActive={RiMicLine}
          IconInactive={RiMicOffLine}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="microphone-select">Input device</Label>
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
      </div>

      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Live level</p>
          <span className="w-10 text-right text-xs text-muted-foreground">
            {microphoneEnabled ? `${microphoneLevel}%` : "off"}
          </span>
        </div>
        <Progress value={microphoneEnabled ? microphoneLevel : 0} />
      </div>
    </div>
  );
}
