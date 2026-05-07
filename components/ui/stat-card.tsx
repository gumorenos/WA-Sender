import { cn } from "@/lib/utils";
import { Card } from "./card";

type StatCardProps = {
  title: string;
  value: string;
  change: string;
  tone?: "accent" | "neutral" | "warm" | "danger";
};

const toneStyles = {
  accent: "from-accent-soft to-transparent text-accent",
  neutral: "from-white/8 to-transparent text-foreground-muted",
  warm: "from-orange-500/15 to-transparent text-orange-300",
  danger: "from-rose-500/15 to-transparent text-rose-200",
};

export function StatCard({
  title,
  value,
  change,
  tone = "neutral",
}: StatCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-28 bg-gradient-to-b opacity-90",
          toneStyles[tone],
        )}
      />
      <div className="relative space-y-5">
        <p className="text-sm text-foreground-muted">{title}</p>
        <div className="space-y-2">
          <p className="text-4xl font-semibold tracking-tight text-foreground">{value}</p>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-foreground-muted">
            {change}
          </p>
        </div>
      </div>
    </Card>
  );
}
