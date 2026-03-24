import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  RiEyeLine,
  RiEyeOffLine,
  RiFullscreenExitLine,
  RiFullscreenLine,
} from "@remixicon/react";

import { IconToggle } from "../IconToggle";
import { MediaStreamPreview } from "../WebcamPreview";
import type { DisplayCaptureCardProps } from "./shared";

export function DisplayCaptureCard({
  isBusy,
  displays,
  screenEnabled,
  isDesktopPreviewVisible,
  isDesktopPreviewLoading,
  desktopPreviewStream,
  onSetScreenEnabled,
  onSetDisplayId,
  onSetDesktopPreviewVisible,
  onOpenMonitorPicker,
}: DisplayCaptureCardProps) {
  const selectedDisplay = displays.find((display) => display.isSelected);

  return (
    <div className="">
      <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/35 p-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Screen capture</p>
          <p className="text-xs text-muted-foreground">
            Enable screen recording for the selected monitor source.
          </p>
        </div>
        <IconToggle
          pressed={screenEnabled}
          disabled={isBusy}
          ariaLabel="Enable screen capture"
          onPressedChange={onSetScreenEnabled}
          IconActive={RiFullscreenLine}
          IconInactive={RiFullscreenExitLine}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border/50 bg-background/35 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Selected monitor</p>
            <p className="text-xs text-muted-foreground">
              Pick a source to keep screen recording and preview in sync.
            </p>
          </div>
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

      <div className="flex flex-col gap-2 rounded-md border border-border/50 bg-background/35 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Desktop preview</p>
            <p className="text-xs text-muted-foreground">
              Show the active display feed while the options window is open.
            </p>
          </div>
          <IconToggle
            pressed={isDesktopPreviewVisible}
            disabled={!screenEnabled || isBusy || displays.length === 0}
            ariaLabel="Show desktop preview"
            onPressedChange={onSetDesktopPreviewVisible}
            IconActive={RiEyeLine}
            IconInactive={RiEyeOffLine}
          />
        </div>
        <MediaStreamPreview
          stream={isDesktopPreviewVisible ? desktopPreviewStream : null}
          isLoading={isDesktopPreviewVisible && isDesktopPreviewLoading}
          unavailableLabel="Desktop preview hidden"
        />
      </div>
    </div>
  );
}
