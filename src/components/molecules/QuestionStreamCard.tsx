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
        "pointer-events-none w-full max-w-full border-border/50 text-card-foreground shadow-xl rounded-md backdrop-blur-sm transition-[transform,opacity,box-shadow] duration-300 ease-out",
        isActive
          ? "ring-2 ring-primary/40 shadow-primary/10 bg-background/80"
          : "opacity-75 ring-1 ring-foreground/5 bg-background/20",
        className,
      )}
    >
      <CardContent className="pt-0">
        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
          {body}
        </p>
      </CardContent>
    </Card>
  );
}
