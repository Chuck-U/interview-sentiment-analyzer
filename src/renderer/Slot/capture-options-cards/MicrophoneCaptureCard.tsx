import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";

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
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="border-b">
        <CardTitle>Microphone</CardTitle>
        <CardDescription>
          Preview metering runs while the options view is active.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-1">
        <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/35 p-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Capture input</p>
            <p className="text-xs text-muted-foreground">
              Enable the microphone to meter levels and record spoken audio.
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

        <div className="rounded-md border border-border/50 bg-background/35 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Live level</p>
            <span className="w-10 text-right text-xs text-muted-foreground">
              {microphoneEnabled ? `${microphoneLevel}%` : "off"}
            </span>
          </div>
          <Progress value={microphoneEnabled ? microphoneLevel : 0} />
        </div>
      </CardContent>
    </Card>
  );
}
