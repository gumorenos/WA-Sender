"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type AgentStatus = "DRAFT" | "ACTIVE" | "INACTIVE";
type AgentSource = "MANUAL" | "BUILDER";

type AgentListItem = {
  id: string;
  name: string;
  source: AgentSource;
  status: AgentStatus;
  llmProvider: string;
  modelName: string | null;
  createdAt: string;
  activeVersion: {
    id: string;
    versionNumber: number;
    generatedPrompt: string;
    tokenEstimate: number;
    promptExcerpt: string;
  } | null;
};

function statusLabel(status: AgentStatus) {
  return status === "ACTIVE"
    ? "Activo"
    : status === "INACTIVE"
      ? "Inactivo"
      : "Borrador";
}

function sourceLabel(source: AgentSource) {
  return source === "BUILDER" ? "Builder" : "Manual";
}

function statusTone(status: AgentStatus) {
  return status === "ACTIVE"
    ? "text-accent"
    : status === "INACTIVE"
      ? "text-foreground-muted"
      : "text-orange-200";
}

export function AgentsListClient() {
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  async function loadAgents() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/agents", { cache: "no-store" });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "No se pudieron cargar los agentes.");
      }

      setAgents(json.agents ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar los agentes.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAgents();
  }, []);

  function handleStatusChange(agentId: string, nextStatus: AgentStatus) {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/agents/${agentId}/status`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: nextStatus }),
        });
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.error ?? "No se pudo actualizar el estado.");
        }

        setAgents((current) =>
          current.map((agent) =>
            agent.id === agentId ? { ...agent, status: json.agent.status } : agent,
          ),
        );
      } catch (statusError) {
        setError(
          statusError instanceof Error
            ? statusError.message
            : "No se pudo actualizar el estado del agente.",
        );
      }
    });
  }

  if (isLoading) {
    return <Card>Cargando agentes...</Card>;
  }

  if (agents.length === 0) {
    return (
      <EmptyState
        title="Todavia no hay agentes"
        description="Crea tu primer agente manual o con builder para empezar a versionar prompts y configuracion."
        helper={
          <Link
            className="text-accent underline-offset-4 hover:underline"
            href="/agents/create"
          >
            Ir a crear agente
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Card className="border border-danger/30 bg-danger/10 text-orange-100">
          {error}
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        {agents.map((agent) => (
          <Card key={agent.id} className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold tracking-tight">{agent.name}</h2>
                <p className="text-sm text-foreground-muted">
                  {agent.llmProvider}
                  {agent.modelName ? ` · ${agent.modelName}` : ""}
                </p>
              </div>
              <span
                className={`rounded-full border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] ${statusTone(agent.status)}`}
              >
                {statusLabel(agent.status)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm text-foreground-muted">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                  Modo
                </p>
                <p className="mt-1">{sourceLabel(agent.source)}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                  Version actual
                </p>
                <p className="mt-1">v{agent.activeVersion?.versionNumber ?? 0}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                  Creado
                </p>
                <p className="mt-1">
                  {new Date(agent.createdAt).toLocaleDateString("es-PE")}
                </p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                  Tokens
                </p>
                <p className="mt-1">{agent.activeVersion?.tokenEstimate ?? 0}</p>
              </div>
            </div>

            <p className="line-clamp-5 text-sm leading-6 text-foreground-muted">
              {agent.activeVersion?.promptExcerpt ?? "Sin prompt activo."}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                disabled={isPending || agent.status === "ACTIVE"}
                onClick={() => handleStatusChange(agent.id, "ACTIVE")}
              >
                Activar
              </Button>
              <Button
                disabled={isPending || agent.status === "INACTIVE"}
                variant="secondary"
                onClick={() => handleStatusChange(agent.id, "INACTIVE")}
              >
                Desactivar
              </Button>
              <Link href={`/agents/${agent.id}/edit`}>
                <Button className="w-full" variant="secondary">
                  Editar
                </Button>
              </Link>
              <Link href="/agents/playground">
                <Button className="w-full" variant="ghost">
                  Ir a playground
                </Button>
              </Link>
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
