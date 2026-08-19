"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type AgentRuntimeState = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "INACTIVE";
  activeVersion: { id: string } | null;
  settings: {
    autoReplyEnabled: boolean;
  } | null;
};

export function AgentAutoReplyControl({ agentId }: { agentId: string }) {
  const [agent, setAgent] = useState<AgentRuntimeState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAgent = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/agents/${agentId}`, { cache: "no-store" });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "No se pudo cargar el estado del agente.");
      }

      setAgent(json.agent as AgentRuntimeState);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar el estado del agente.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadAgent();
  }, [loadAgent]);

  async function setAutoReply(enabled: boolean) {
    if (
      enabled &&
      !window.confirm(
        "Vas a habilitar respuestas automaticas para este agente. Esto no activa los switches globales del servidor y no debe usarse con trafico real hasta completar QA. Continuar?",
      )
    ) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/agents/${agentId}/auto-reply`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          confirmed: enabled,
        }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "No se pudo actualizar auto-reply.");
      }

      setNotice(
        enabled
          ? "Auto-reply habilitado para este agente. Los switches globales siguen siendo un gate independiente."
          : "Auto-reply deshabilitado para este agente.",
      );
      await loadAgent();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "No se pudo actualizar auto-reply.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <Card>Cargando controles de seguridad del agente...</Card>;
  }

  if (!agent) {
    return (
      <Card className="border border-danger/30 bg-danger/10 text-orange-100">
        {error ?? "No se pudo cargar el agente."}
      </Card>
    );
  }

  const autoReplyEnabled = agent.settings?.autoReplyEnabled === true;
  const canEnable = agent.status === "ACTIVE" && Boolean(agent.activeVersion);

  return (
    <Card className="space-y-5 border border-amber-400/30 bg-amber-400/5">
      <div className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-amber-300">
          Seguridad de respuestas automaticas
        </p>
        <h2 className="text-xl font-semibold tracking-tight">
          Auto-reply {autoReplyEnabled ? "habilitado" : "deshabilitado"}
        </h2>
        <p className="text-sm leading-6 text-foreground-muted">
          Asignar este agente a una instancia no habilita respuestas. La activacion
          es deliberada y separada. Ademas, el servidor exige los switches globales
          `AGENT_AUTOREPLY_ENABLED` y, para envio real,
          `AGENT_REAL_REPLY_ENABLED`.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-orange-100">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent">
          {notice}
        </div>
      ) : null}

      {!canEnable && !autoReplyEnabled ? (
        <p className="text-sm text-foreground-muted">
          Para habilitar auto-reply, el agente debe estar ACTIVE y tener una
          version activa.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {autoReplyEnabled ? (
          <Button
            disabled={isSubmitting}
            variant="secondary"
            onClick={() => setAutoReply(false)}
          >
            Deshabilitar auto-reply
          </Button>
        ) : (
          <Button
            disabled={isSubmitting || !canEnable}
            onClick={() => setAutoReply(true)}
          >
            Habilitar auto-reply
          </Button>
        )}
        <Button disabled={isSubmitting} variant="ghost" onClick={loadAgent}>
          Actualizar estado
        </Button>
      </div>
    </Card>
  );
}
