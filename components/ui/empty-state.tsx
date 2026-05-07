import type { ReactNode } from "react";
import { Button } from "./button";
import { Card } from "./card";

type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  helper?: ReactNode;
};

export function EmptyState({
  title,
  description,
  actionLabel,
  helper,
}: EmptyStateProps) {
  return (
    <Card className="surface-grid flex min-h-72 flex-col items-start justify-between gap-8 border-dashed">
      <div className="space-y-4">
        <div className="inline-flex rounded-full border border-accent/30 bg-accent-soft px-3 py-1 font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
          Mock mode
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="max-w-xl text-sm leading-6 text-foreground-muted">{description}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {actionLabel ? <Button>{actionLabel}</Button> : null}
        {helper ? <div className="text-sm text-foreground-muted">{helper}</div> : null}
      </div>
    </Card>
  );
}
