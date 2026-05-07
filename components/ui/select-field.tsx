import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Option = {
  label: string;
  value: string;
};

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  options: Option[];
};

export function SelectField({
  className,
  hint,
  label,
  options,
  ...props
}: SelectFieldProps) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <select
        className={cn(
          "rounded-2xl border border-border bg-background-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/60",
          className,
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="text-xs text-foreground-muted">{hint}</span> : null}
    </label>
  );
}
