import type { ReactNode } from "react";

import { parseMessagePreview, type MessagePreviewVariableMap } from "@/lib/message-preview";
import { cn } from "@/lib/utils";

type WhatsAppPreviewPhoneProps = {
  message: string;
  variables?: MessagePreviewVariableMap;
  className?: string;
  title?: string;
  subtitle?: string;
  contactName?: string;
};

const VARIABLE_RENDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_-]*)\}/g;

function renderTextWithVariables(
  text: string,
  variables: MessagePreviewVariableMap | undefined,
) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(VARIABLE_RENDER_PATTERN)) {
    const matchIndex = match.index ?? 0;
    const variableName = match[1];
    const literalValue = variables?.[variableName] ?? `{${variableName}}`;

    if (matchIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, matchIndex));
    }

    nodes.push(
      <span
        key={`${variableName}-${matchIndex}`}
        className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-2 py-0.5 font-medium text-white"
        title={`Variable ${variableName}`}
      >
        {literalValue}
      </span>,
    );

    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

function RenderedSegments({
  segments,
  variables,
}: {
  segments: ReturnType<typeof parseMessagePreview>["lines"][number]["segments"];
  variables?: MessagePreviewVariableMap;
}) {
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return (
            <span key={`${segment.type}-${index}`} className="whitespace-pre-wrap">
              {renderTextWithVariables(segment.value, variables)}
            </span>
          );
        }

        if (segment.type === "bold") {
          return (
            <strong key={`${segment.type}-${index}`} className="font-semibold text-white">
              {renderTextWithVariables(segment.value, variables)}
            </strong>
          );
        }

        if (segment.type === "italic") {
          return (
            <em key={`${segment.type}-${index}`} className="italic text-white/95">
              {renderTextWithVariables(segment.value, variables)}
            </em>
          );
        }

        if (segment.type === "strike") {
          return (
            <s key={`${segment.type}-${index}`} className="text-white/80">
              {renderTextWithVariables(segment.value, variables)}
            </s>
          );
        }

        if (segment.type === "mono") {
          return (
            <code
              key={`${segment.type}-${index}`}
              className="rounded-xl border border-black/10 bg-black/20 px-2 py-1 font-mono text-[0.78rem] tracking-tight text-white"
            >
              {renderTextWithVariables(segment.value, variables)}
            </code>
          );
        }

        return (
          <span
            key={`${segment.type}-${index}`}
            className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-2 py-0.5 font-medium text-white"
            title={`Variable ${segment.name}`}
          >
            {segment.value}
          </span>
        );
      })}
    </>
  );
}

export function WhatsAppPreviewPhone({
  message,
  variables,
  className,
  title = "WA Sender",
  subtitle = "Vista previa segura",
  contactName = "Andrea",
}: WhatsAppPreviewPhoneProps) {
  const preview = parseMessagePreview(message, variables);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[34px] border border-white/10 bg-[#0b141a] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)]",
        className,
      )}
    >
      <div className="mx-auto mb-4 h-1.5 w-20 rounded-full bg-white/10" />

      <div className="rounded-[28px] border border-white/5 bg-[#111b21]">
        <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#24a869] to-[#1f7a6d] text-sm font-semibold text-white">
            {contactName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{title}</p>
            <p className="truncate text-xs text-white/55">{subtitle}</p>
          </div>
          <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
            En vivo
          </div>
        </div>

        <div className="space-y-2 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.04),_transparent_35%),linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0))] px-4 py-4">
          <div className="ml-auto max-w-[86%] rounded-[24px] rounded-br-md bg-[#1f7a6d] px-4 py-3 text-[15px] leading-7 text-white">
            {preview.lines.map((line, index) => (
              <div
                key={`preview-line-${index}`}
                className={cn(
                  "min-h-[1.5rem]",
                  index > 0 && line.segments.length > 0 ? "mt-2" : "",
                )}
              >
                {line.segments.length > 0 ? (
                  <RenderedSegments segments={line.segments} variables={variables} />
                ) : (
                  <span className="inline-block h-6" aria-hidden="true">
                    {" "}
                  </span>
                )}
              </div>
            ))}

            <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-white/65">
              <span>12:48</span>
              <span aria-hidden="true">✓✓</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
