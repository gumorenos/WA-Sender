"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { TextAreaField } from "@/components/ui/text-area-field";
import {
  DEFAULT_MESSAGE_PREVIEW_TEXT,
  DEFAULT_MESSAGE_PREVIEW_VARIABLES,
  parseMessagePreview,
} from "@/lib/message-preview";
import { WhatsAppPreviewPhone } from "@/components/utilities/whatsapp-preview-phone";

const DEFAULT_HELP_CARDS = [
  {
    title: "Negrita",
    example: "*Hola, {nombre}*",
    note: "Resalta una parte clave del mensaje.",
  },
  {
    title: "Cursiva, tachado y mono",
    example: "_Confirmado_ ~cancelado~ ```ABC-2048```",
    note: "Sirve para enfasis, correcciones y codigos.",
  },
  {
    title: "Saltos y variables",
    example: "Linea 1\\nLinea 2\\n{empresa} / {codigo}",
    note: "El preview interpreta \\n como salto de linea.",
  },
] as const;

export function MessagePreviewClient() {
  const [message, setMessage] = useState(DEFAULT_MESSAGE_PREVIEW_TEXT);
  const parsedPreview = useMemo(
    () => parseMessagePreview(message, DEFAULT_MESSAGE_PREVIEW_VARIABLES),
    [message],
  );

  const parsedCount = parsedPreview.lines.reduce((count, line) => {
    return line.segments.length > 0 ? count + 1 : count;
  }, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Utilities"
        title="Vista previa de mensaje"
        description="Editor seguro con preview tipo telefono para validar formato WhatsApp antes de usarlo en campanas o agentes."
        actions={
          <Button
            variant="secondary"
            onClick={() => setMessage(DEFAULT_MESSAGE_PREVIEW_TEXT)}
          >
            Restablecer mensaje por defecto
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <Card className="space-y-4">
            <TextAreaField
              label="Mensaje"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="min-h-[260px] font-mono text-[13px] leading-6"
              hint="Compatible con *negrita*, _cursiva_, ~tachado~, ```monoespaciado```, variables y saltos con \\n."
            />

            <div className="flex flex-wrap gap-2 text-xs text-foreground-muted">
              <span className="rounded-full border border-border bg-background-panel px-3 py-1.5">
                {parsedCount} lineas visibles
              </span>
              <span className="rounded-full border border-border bg-background-panel px-3 py-1.5">
                {message.length} caracteres
              </span>
              <span className="rounded-full border border-border bg-background-panel px-3 py-1.5">
                Variables: {Object.keys(DEFAULT_MESSAGE_PREVIEW_VARIABLES).join(", ")}
              </span>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            {DEFAULT_HELP_CARDS.map((card) => (
              <Card key={card.title} className="space-y-3">
                <p className="text-sm font-semibold text-foreground">{card.title}</p>
                <p className="rounded-2xl border border-border bg-background-panel px-3 py-2 font-mono text-xs leading-6 text-foreground">
                  {card.example}
                </p>
                <p className="text-xs leading-5 text-foreground-muted">{card.note}</p>
              </Card>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Preview tipo telefono</p>
                <p className="text-xs text-foreground-muted">
                  El render se construye con nodos React, sin HTML inyectado.
                </p>
              </div>
              <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-medium text-emerald-200">
                Seguro
              </div>
            </div>

            <WhatsAppPreviewPhone
              message={message}
              variables={DEFAULT_MESSAGE_PREVIEW_VARIABLES}
              contactName="A"
              title="Andrea"
              subtitle="WhatsApp preview"
              className="min-h-[560px]"
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
