import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

type SectionBlockProps = {
  title: string;
  description: string;
  aside?: ReactNode;
  children: ReactNode;
};

export function SectionBlock({
  title,
  description,
  aside,
  children,
}: SectionBlockProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
      <Card className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm leading-6 text-foreground-muted">{description}</p>
        </div>
        {children}
      </Card>
      {aside ? <Card className="space-y-4">{aside}</Card> : null}
    </div>
  );
}
