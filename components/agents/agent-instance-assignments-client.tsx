"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select-field";

type AgentItem = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "INACTIVE";
};

type InstanceItem = {
  id: string;
  name: string;
  status: "open" | "connecting" | "disconnected" | "error";
};

type AssignmentItem = {
  id: string;
  active: boolean;
  agentId: string;
  instanceId: string;
};

function statusLabel(status: AgentItem["status"] | InstanceItem["status"]) {
  const labels: Record<string, string> = {
    ACTIVE: "activo",
    INACTIVE: "inactivo",
    DRAFT: "borrador",
    open: "activa",
    connecting: "conectando",
    disconnected: "desconectada",
    error: "error",
  };

  return labels[status] ?? status;
}

export function AgentInstanceAssignmentsClient() {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [instances, setInstances] = useState<InstanceItem[]>([]);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const agentOptions = useMemo(
    () => [
      { label: "Sin agente asignado", value: "none" },
      ...agents.map((agent) => ({
        label: `${agent.name} (${statusLabel(agent.status)})`,
        value: agent.id,
      })),
    ],
    [agents],
  );

  async function loadAssignments() {
    setIsLoading(true);
    setError(null);

    try {
      const [agentsResponse, instancesResponse, assignmentsResponse] =
        await Promise.all([
          fetch("/api/agents", { cache: "no-store" }),
          fetch("/api/instances", { cache: "no-store" }),
          fetch("/api/agents/assignments", { cache: "no-store" }),
        ]);

      const [agentsJson, instancesJson, assignmentsJson] = await Promise.all([
        agentsResponse.json(),
        instancesResponse.json(),
        assignmentsResponse.json(),
      ]);

      if (!agentsResponse.ok) {
        throw new Error(agentsJson.error ?? "No se pudieron cargar los agentes.");
      }

      if (!instancesResponse.ok) {
        throw new Error(
          instancesJson.error ?? "No se pudieron cargar las instancias.",
        );
      }

      if (!assignmentsResponse.ok) {
        throw new Error(
          assignmentsJson.error ?? "No se pudieron cargar las asignaciones.",
        );
      }

      const loadedAgents = (agentsJson.agents ?? []) as AgentItem[];
      const loadedInstances = (instancesJson.instances ?? []) as InstanceItem[];
      const loadedAssignments = (assignmentsJson.assignments ??
        []) as AssignmentItem[];
      const selected = loadedInstances.reduce<Record<string, string>>(
        (current, instance: InstanceItem) => {
          const assignment = loadedAssignments.find(
            (item: AssignmentItem) => item.instanceId === instance.id,
          );
          current[instance.id] = assignment?.agentId ?? "none";
          return current;
        },
        {},
      );

      setAgents(loadedAgents);
      setInstances(loadedInstances);
      setAssignments(loadedAssignments);
      setSelectedAgents(selected);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar las asignaciones.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAssignments();
  }, []);

  function saveAssignment(instanceId: string) {
    startTransition(async () => {
      try {
        const agentId = selectedAgents[instanceId] ?? "none";
        const response = await fetch("/api/agents/assignments", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            instanceId,
            agentId: agentId === "none" ? null : agentId,
            active: true,
          }),
        });
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.error ?? "No se pudo guardar la asignacion.");
        }

        await loadAssignments();
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "No se pudo guardar la asignacion.",
        );
      }
    });
  }

  if (isLoading) {
    return <Card>Cargando asignaciones de agentes...</Card>;
  }

  return (
    <Card className="space-y-5 border-accent/20 bg-background-panel/80">
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">
          Autorespuesta WhatsApp
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">
          Asociar agente a instancia
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-foreground-muted">
          Una instancia puede tener un agente activo asociado. El webhook solo
          responde mensajes entrantes de usuarios, ignora grupos por defecto y
          respeta opt-out, rate limit y fallos de proveedor.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-orange-100">
          {error}
        </div>
      ) : null}

      {instances.length === 0 || agents.length === 0 ? (
        <div className="rounded-2xl border border-border bg-background-card p-4 text-sm text-foreground-muted">
          Necesitas al menos una instancia WhatsApp y un agente creado antes de
          activar respuestas automaticas.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {instances.map((instance) => {
            const currentAssignment = assignments.find(
              (assignment) => assignment.instanceId === instance.id,
            );

            return (
              <div
                key={instance.id}
                className="space-y-4 rounded-2xl border border-border bg-background-card p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{instance.name}</h3>
                    <p className="text-sm text-foreground-muted">
                      Estado: {statusLabel(instance.status)}
                    </p>
                  </div>
                  <span className="rounded-full border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                    {currentAssignment ? "Asignada" : "Libre"}
                  </span>
                </div>

                <SelectField
                  label="Agente asociado"
                  value={selectedAgents[instance.id] ?? "none"}
                  options={agentOptions}
                  onChange={(event) =>
                    setSelectedAgents((current) => ({
                      ...current,
                      [instance.id]: event.target.value,
                    }))
                  }
                />

                <Button
                  disabled={isPending}
                  onClick={() => saveAssignment(instance.id)}
                >
                  Guardar asignacion
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
