import { useState } from "react";
import type { CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WindowBoundsSnapshot, WindowSizePreset } from "@/shared/window-controls";
import { RiExpandDiagonalLine } from "@remixicon/react";

type WindowResizePresetOption = {
  readonly preset: WindowSizePreset;
  readonly label: string;
  readonly description: string;
};

type WindowResizeControlProps = {
  readonly windowBounds: WindowBoundsSnapshot | null;
  readonly presetOptions: readonly WindowResizePresetOption[];
  readonly onSelectPreset: (
    preset: WindowSizePreset,
  ) => Promise<WindowBoundsSnapshot>;
};

export function WindowResizeControl({
  windowBounds,
  presetOptions,
  onSelectPreset,
}: WindowResizeControlProps) {
  const [isResizing, setIsResizing] = useState(false);

  const handleSelectPreset = async (preset: WindowSizePreset) => {
    try {
      setIsResizing(true);
      await onSelectPreset(preset);
    } finally {
      setIsResizing(false);
    }
  };

  return (
    <div style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isResizing}
            aria-label="Resize window"
            title="Resize window"
          >
            <RiExpandDiagonalLine data-icon="inline-start" />
            Resize
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel>Resize presets</DropdownMenuLabel>
          {windowBounds ? (
            <DropdownMenuLabel className="pt-0 text-[11px]">
              Current: {windowBounds.width} x {windowBounds.height}
            </DropdownMenuLabel>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {presetOptions.map((option) => (
              <DropdownMenuItem
                key={option.preset}
                onSelect={() => {
                  void handleSelectPreset(option.preset);
                }}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span>{option.label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {option.description}
                  </span>
                </div>
                <DropdownMenuShortcut>
                  {option.preset === "half"
                    ? "50%"
                    : option.preset === "three-quarters"
                      ? "75%"
                      : "100%"}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
