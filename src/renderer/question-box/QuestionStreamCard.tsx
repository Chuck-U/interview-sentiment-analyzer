import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type QuestionStreamCardProps = {
  readonly title: string;
  readonly body: string;
  readonly meta?: string;
  readonly isActive: boolean;
  readonly className?: string;
};

export function QuestionStreamCard({
  title,
  body,
  meta,
  isActive,
  className,
}: QuestionStreamCardProps) {
  return (
    <Card
      size="sm"
      className={cn(
        "pointer-events-none w-full max-w-full border-border/50 bg-background/90 text-card-foreground shadow-xl backdrop-blur-sm transition-[transform,opacity,box-shadow] duration-300 ease-out",
        isActive
          ? "ring-2 ring-primary/40 shadow-primary/10"
          : "opacity-75 ring-1 ring-foreground/5",
        className,
      )}
    >
      <CardHeader className="gap-0.5 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {title}
        </CardTitle>
        {meta ? <CardDescription>{meta}</CardDescription> : null}
      </CardHeader>
      <CardContent className="pt-0">
        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
          {body}
        </p>
      </CardContent>
    </Card>
  );
}
