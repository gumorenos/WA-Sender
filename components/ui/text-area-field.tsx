import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
};

export function TextAreaField({
  className,
  hint,
  label,
  ...props
}: TextAreaFieldProps) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <textarea
        className={cn(
          "min-h-32 rounded-3xl border border-border bg-background-panel px-4 py-3 text-sm leading-6 text-foreground outline-none transition placeholder:text-foreground-muted focus:border-accent/60",
          className,
        )}
        {...props}
      />
      {hint ? <span className="text-xs text-foreground-muted">{hint}</span> : null}
    </label>
  );
}
