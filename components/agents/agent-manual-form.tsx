"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { estimateTokenCount } from "@/lib/agents/prompt-builder";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextAreaField } from "@/components/ui/text-area-field";

const inputClass =
  "rounded-2xl border border-border bg-background-panel px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-foreground-muted focus:border-accent/60";

export function AgentManualForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tokenEstimate = estimateTokenCount(instructions || " ");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "MANUAL",
          name,
          instructions,
          llmProvider: "MOCK",
          modelName: "",
        }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "No se pudo crear el agente.");
      }

      router.push("/agents");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo crear el agente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]" onSubmit={handleSubmit}>
      <Card className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">Modo manual</h2>
          <p className="text-sm leading-6 text-foreground-muted">
            Escribe instrucciones completas y el backend las envolvera en un
            prompt deterministico versionable.
          </p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-orange-100">
            {error}
          </div>
        ) : null}

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">
            Nombre del asistente
          </span>
          <input
            className={inputClass}
            maxLength={80}
            placeholder="Ej. Recepcion Dental"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <TextAreaField
          className="min-h-72"
          hint="Incluye alcance, estilo de respuesta, limites y reglas del negocio."
          label="Instrucciones completas"
          maxLength={8000}
          placeholder="Responde solo consultas sobre tratamientos, horarios, precios referenciales y reservas..."
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
        />

        <div className="flex gap-3">
          <Button disabled={isSubmitting} type="submit">
            Crear agente
          </Button>
          <Button
            disabled={isSubmitting}
            type="button"
            variant="ghost"
            onClick={() => {
              setName("");
              setInstructions("");
              setError(null);
            }}
          >
            Limpiar
          </Button>
        </div>
      </Card>

      <Card className="space-y-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
          Revision
        </p>
        <div className="space-y-3 text-sm text-foreground-muted">
          <p>Tokens aproximados: {tokenEstimate}</p>
          <p>El prompt final se genera sin LLM y queda versionado en la base.</p>
          <p>
            Cada actualizacion futura de instrucciones creara una nueva version
            del agente.
          </p>
        </div>
      </Card>
    </form>
  );
}
