import type { CSSProperties } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

type ShortcutSettingsCardProps = {
  readonly shortcutLabel: string;
  readonly isShortcutEnabled: boolean;
  readonly isBusy: boolean;
  readonly onSetShortcutEnabled: (enabled: boolean) => void;
};

export function ShortcutSettingsCard({
  shortcutLabel,
  isShortcutEnabled,
  isBusy,
  onSetShortcutEnabled,
}: ShortcutSettingsCardProps) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Keyboard Shortcuts</CardTitle>
        <CardDescription>
          Keep the global recording toggle available while the app is running.
        </CardDescription>
      </CardHeader>
      <CardContent className="py-1">
        <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/35 p-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm">Recording toggle</p>
            <p className="text-sm text-muted-foreground">
              Trigger: {shortcutLabel}
            </p>
          </div>
          <div style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
            <Switch
              checked={isShortcutEnabled}
              aria-label="Toggle recording keyboard shortcut"
              disabled={isBusy}
              onCheckedChange={onSetShortcutEnabled}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
