import type { ComponentType } from "react";

import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

type IconToggleProps = {
  readonly pressed: boolean;
  readonly disabled?: boolean;
  readonly onPressedChange: (pressed: boolean) => void;
  readonly ariaLabel: string;
  readonly id?: string;
  readonly IconActive: ComponentType<{ className?: string }>;
  readonly IconInactive: ComponentType<{ className?: string }>;
  readonly className?: string;
};

export function IconToggle({
  pressed,
  disabled,
  onPressedChange,
  ariaLabel,
  id,
  IconActive,
  IconInactive,
  className,
}: IconToggleProps) {
  const Icon = pressed ? IconActive : IconInactive;
  return (
    <Toggle
      id={id}
      pressed={pressed}
      disabled={disabled}
      aria-label={ariaLabel}
      onPressedChange={onPressedChange}
      variant="outline"
      size="default"
      className={cn("shrink-0", className)}
    >
      <Icon className={cn(pressed ? "text-primary" : "text-muted-foreground")} />
    </Toggle>
  );
}
