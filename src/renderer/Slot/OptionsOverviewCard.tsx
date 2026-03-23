import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { OptionsProps } from "./Options";
import { ShortcutSettingsCard } from "./ShortcutSettingsCard";
import { WindowStatusBadges } from "./WindowStatusBadges";
import { cn } from "@/lib/utils";

type OptionsOverviewCardProps = Pick<
  OptionsProps,
  | "statusLabel"
  | "statusVariant"
  | "platformLabel"
  | "windowSizeLabel"
  | "windowBoundsLabel"
  | "shortcutLabel"
  | "isShortcutEnabled"
  | "onSetShortcutEnabled"
  | "isBusy"
>;

export function OptionsOverviewCard({
  statusLabel,
  statusVariant,
  platformLabel,
  windowSizeLabel,
  windowBoundsLabel,
  shortcutLabel,
  isShortcutEnabled,
  onSetShortcutEnabled,
  isBusy,
}: OptionsOverviewCardProps) {
  return (
    <Card className={cn("relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden")}>
      <CardHeader className="flex shrink-0 flex-col gap-1">
        <CardTitle>Options</CardTitle>
        <WindowStatusBadges
          statusLabel={statusLabel}
          statusVariant={statusVariant}
          platformLabel={platformLabel}
          windowSizeLabel={windowSizeLabel}
          windowBoundsLabel={windowBoundsLabel}
        />
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <ShortcutSettingsCard
          shortcutLabel={shortcutLabel}
          isShortcutEnabled={isShortcutEnabled}
          isBusy={isBusy}
          onSetShortcutEnabled={onSetShortcutEnabled}
        />
      </CardContent>
    </Card>
  );
}
