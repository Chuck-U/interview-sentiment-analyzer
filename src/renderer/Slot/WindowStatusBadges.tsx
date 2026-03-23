import { Badge } from "@/components/ui/badge";

type WindowStatusBadgesProps = {
  readonly statusLabel: string;
  readonly statusVariant: "default" | "secondary" | "outline";
  readonly platformLabel: string;
  readonly windowSizeLabel: string;
  readonly windowBoundsLabel?: string;
};

export function WindowStatusBadges({
  statusLabel,
  statusVariant,
  platformLabel,
  windowSizeLabel,
  windowBoundsLabel,
}: WindowStatusBadgesProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={statusVariant}>{statusLabel}</Badge>
      <Badge variant="outline" className="capitalize">
        {platformLabel}
      </Badge>
      <Badge variant="outline">{windowSizeLabel}</Badge>
      {windowBoundsLabel ? (
        <Badge variant="outline">{windowBoundsLabel}</Badge>
      ) : null}
    </div>
  );
}
