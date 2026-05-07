import type { HTMLAttributes, PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

type CardProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>;

export function Card({ children, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "glass-panel rounded-[28px] p-5 text-sm text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
