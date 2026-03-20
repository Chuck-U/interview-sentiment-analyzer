import type { CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { RiPushpinFill } from "@remixicon/react";
import { cn } from "@/lib/utils";
type WindowPinControlProps = {
  readonly isPinned: boolean;
  readonly onToggle: (nextValue: boolean) => Promise<boolean>;
};

export function WindowPinControl({
  isPinned,
  onToggle,
}: WindowPinControlProps) {
  return (
    <Button
      type="button"
      variant={isPinned ? "default" : "outline"}
      size="sm"
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      aria-pressed={isPinned}
      title={isPinned ? "Unlock window position" : "Pin window position"}
      onClick={() => {
        void onToggle(!isPinned);
      }}
      className="min-w-16 bg-transparent"
    >
      <RiPushpinFill
        data-icon="inline-start hover:text-yellow-8"
        className={cn("size-5", isPinned ? "text-white" : "text-muted-foreground")}
      />
    </Button>
  );
}
