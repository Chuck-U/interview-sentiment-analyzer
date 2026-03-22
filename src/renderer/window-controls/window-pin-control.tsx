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
      variant="ghost"
      size="sm"
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      aria-pressed={isPinned}
      title={isPinned ? "Unlock window position" : "Pin window position"}
      onClick={() => {
        void onToggle(!isPinned);
      }}
      className={cn("min-w-10 group active:bg-transparent hover:bg-transparent", " ease-in p-0 mx-2")}
    >
      <RiPushpinFill
        data-icon="inline-start hover:text-yellow-8"
        className={cn("size-5", isPinned ? "text-yellow-indicator  shadow-yellow-contrast -translate-x-1 translate-y-1" : "text-muted-foreground", isPinned ? "" : "group-hover:-translate-x-1 group-hover:translate-y-1 transition-transform duration-75 delay-100 ease-in-out")}
      />
    </Button>
  );
}
