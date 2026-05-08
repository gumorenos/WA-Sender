"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { BuilderAgentInput } from "@/lib/agents/schemas";
import { buildBuilderPrompt, estimateTokenCount } from "@/lib/agents/prompt-builder";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextAreaField } from "@/components/ui/text-area-field";

const inputClass =
  "rounded-2xl border border-border bg-background-panel px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-foreground-muted focus:border-accent/60";

const capabilityDefinitions = [
  { key: "servicios", label: "servicios" },
  { key: "precios", label: "precios" },
  { key: "horarios", label: "horarios" },
  { key: "ubicacion", label: "ubicacion" },
  { key: "promociones", label: "promociones" },
  { key: "reservas", label: "reservas / turnos" },
  { key: "mediosPago", label: "medios de pago" },
  { key: "cancelacion", label: "politicas de cancelacion" },
  { key: "cuotas", label: "cuotas y financiacion" },
  { key: "otro", label: "otro" },
] as const;

const toneDefinitions = [
  { key: "formal", label: "formal" },
  { key: "professional", label: "profesional" },
  { key: "technical", label: "tecnico" },
  { key: "brief", label: "breve" },
  { key: "close", label: "cercano" },
  { key: "sales", label: "vendedor" },
  { key: "empathetic", label: "empatico" },
  { key: "conversational", label: "conversacional" },
  { key: "useEmojis", label: "usar emojis" },
  { key: "shortAnswers", label: "respuestas cortas" },
] as const;

type AgentVersion = {
  id: string;
  versionNumber: number;
  source: "MANUAL" | "BUILDER";
  createdAt: string;
  tokenEstimate: number;
  promptExcerpt: string;
};

type AgentResponse = {
  id: string;
  name: string;
  source: "MANUAL" | "BUILDER";
  status: "DRAFT" | "ACTIVE" | "INACTIVE";
  llmProvider: string;
  modelName: string | null;
  activeVersion: {
    versionNumber: number;
    generatedPrompt: string;
    systemPrompt: string;
    config: {
      manualInstructions?: string;
    } | null;
    builderInput: BuilderAgentInput | null;
    tokenEstimate: number;
  } | null;
};

const emptyBuilderState: BuilderAgentInput = {
  source: "BUILDER",
  llmProvider: "MOCK",
  modelName: "",
  identity: {
    category: "",
    assistantName: "",
    businessName: "",
    website: "",
    facebook: "",
    instagram: "",
    address: "",
    businessHours: "",
    otherCategory: "",
    objective: "",
  },
  capabilities: {
    servicios: { enabled: false, notes: "" },
    precios: { enabled: false, notes: "" },
    horarios: { enabled: false, notes: "" },
    ubicacion: { enabled: false, notes: "" },
    promociones: { enabled: false, notes: "" },
    reservas: { enabled: false, notes: "" },
    mediosPago: { enabled: false, notes: "" },
    cancelacion: { enabled: false, notes: "" },
    cuotas: { enabled: false, notes: "" },
    otro: { enabled: false, notes: "" },
  },
  audience: {
    customerType: "",
    ageRange: "",
    technicalLevel: "",
    region: "",
  },
  tone: {
    formal: false,
    professional: false,
    technical: false,
    brief: false,
    close: false,
    sales: false,
    empathetic: false,
    conversational: false,
    useEmojis: false,
    shortAnswers: false,
  },
};

function sourceLabel(source: "MANUAL" | "BUILDER") {
  return source === "BUILDER" ? "Builder" : "Manual";
}

export function AgentEditClient({ agentId }: { agentId: string }) {
  const router = useRouter();
  const [agent, setAgent] = useState<AgentResponse | null>(null);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [manualName, setManualName] = useState("");
  const [manualInstructions, setManualInstructions] = useState("");
  const [builderData, setBuilderData] = useState<BuilderAgentInput>(emptyBuilderState);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadAgent = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [agentResponse, versionsResponse] = await Promise.all([
        fetch(`/api/agents/${agentId}`, { cache: "no-store" }),
        fetch(`/api/agents/${agentId}/versions`, { cache: "no-store" }),
      ]);
      const agentJson = await agentResponse.json();
      const versionsJson = await versionsResponse.json();

      if (!agentResponse.ok) {
        throw new Error(agentJson.error ?? "No se pudo cargar el agente.");
      }

      if (!versionsResponse.ok) {
        throw new Error(versionsJson.error ?? "No se pudieron cargar las versiones.");
      }

      const nextAgent = agentJson.agent as AgentResponse;
      setAgent(nextAgent);
      setVersions(versionsJson.versions ?? []);

      if (nextAgent.source === "MANUAL") {
        setManualName(nextAgent.name);
        setManualInstructions(
          nextAgent.activeVersion?.config?.manualInstructions ??
            nextAgent.activeVersion?.generatedPrompt ??
            "",
        );
      } else {
        const nextBuilderInput =
          nextAgent.activeVersion?.builderInput ?? emptyBuilderState;
        setBuilderData(nextBuilderInput);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar el agente.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadAgent();
  }, [loadAgent]);

  function updateBuilderIdentity<K extends keyof BuilderAgentInput["identity"]>(
    key: K,
    value: BuilderAgentInput["identity"][K],
  ) {
    setBuilderData((current) => ({
      ...current,
      identity: {
        ...current.identity,
        [key]: value,
      },
    }));
  }

  function updateBuilderAudience<K extends keyof BuilderAgentInput["audience"]>(
    key: K,
    value: BuilderAgentInput["audience"][K],
  ) {
    setBuilderData((current) => ({
      ...current,
      audience: {
        ...current.audience,
        [key]: value,
      },
    }));
  }

  function updateCapability(
    key: keyof BuilderAgentInput["capabilities"],
    field: "enabled" | "notes",
    value: boolean | string,
  ) {
    setBuilderData((current) => ({
      ...current,
      capabilities: {
        ...current.capabilities,
        [key]: {
          ...current.capabilities[key],
          [field]: value,
        },
      },
    }));
  }

  function updateTone(
    key: keyof BuilderAgentInput["tone"],
    value: boolean,
  ) {
    setBuilderData((current) => ({
      ...current,
      tone: {
        ...current.tone,
        [key]: value,
      },
    }));
  }

  async function saveManual() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "MANUAL",
          name: manualName,
          instructions: manualInstructions,
          llmProvider: "MOCK",
          modelName: "",
        }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "No se pudo guardar el agente.");
      }

      router.refresh();
      await loadAgent();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar el agente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function saveBuilder() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(builderData),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "No se pudo guardar el agente.");
      }

      router.refresh();
      await loadAgent();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar el agente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <Card>Cargando agente...</Card>;
  }

  if (!agent) {
    return <Card>No se pudo cargar el agente.</Card>;
  }

  const builderReview = buildBuilderPrompt(builderData);
  const manualTokens = estimateTokenCount(manualInstructions || " ");

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
      <div className="space-y-6">
        {error ? (
          <Card className="border border-danger/30 bg-danger/10 text-orange-100">
            {error}
          </Card>
        ) : null}

        <Card className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                Editar agente
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                {agent.name}
              </h2>
              <p className="mt-1 text-sm text-foreground-muted">
                Modo {sourceLabel(agent.source)} · estado {agent.status.toLowerCase()}
              </p>
            </div>
            <Link href="/agents">
              <Button variant="ghost">Volver</Button>
            </Link>
          </div>

          {agent.source === "MANUAL" ? (
            <div className="space-y-4">
              <Field label="Nombre del asistente">
                <input
                  className={inputClass}
                  value={manualName}
                  onChange={(event) => setManualName(event.target.value)}
                />
              </Field>
              <TextAreaField
                className="min-h-80"
                label="Instrucciones completas"
                value={manualInstructions}
                onChange={(event) => setManualInstructions(event.target.value)}
              />
              <div className="flex gap-3">
                <Button disabled={isSubmitting} onClick={saveManual}>
                  Guardar cambios
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Rubro/categoria">
                  <input
                    className={inputClass}
                    value={builderData.identity.category}
                    onChange={(event) =>
                      updateBuilderIdentity("category", event.target.value)
                    }
                  />
                </Field>
                <Field label="Nombre del asistente">
                  <input
                    className={inputClass}
                    value={builderData.identity.assistantName}
                    onChange={(event) =>
                      updateBuilderIdentity("assistantName", event.target.value)
                    }
                  />
                </Field>
                <Field label="Nombre del negocio">
                  <input
                    className={inputClass}
                    value={builderData.identity.businessName}
                    onChange={(event) =>
                      updateBuilderIdentity("businessName", event.target.value)
                    }
                  />
                </Field>
                <Field label="Pagina web">
                  <input
                    className={inputClass}
                    value={builderData.identity.website}
                    onChange={(event) =>
                      updateBuilderIdentity("website", event.target.value)
                    }
                  />
                </Field>
                <Field label="Facebook">
                  <input
                    className={inputClass}
                    value={builderData.identity.facebook}
                    onChange={(event) =>
                      updateBuilderIdentity("facebook", event.target.value)
                    }
                  />
                </Field>
                <Field label="Instagram">
                  <input
                    className={inputClass}
                    value={builderData.identity.instagram}
                    onChange={(event) =>
                      updateBuilderIdentity("instagram", event.target.value)
                    }
                  />
                </Field>
                <Field label="Direccion">
                  <input
                    className={inputClass}
                    value={builderData.identity.address}
                    onChange={(event) =>
                      updateBuilderIdentity("address", event.target.value)
                    }
                  />
                </Field>
                <Field label="Horarios de atencion">
                  <input
                    className={inputClass}
                    value={builderData.identity.businessHours}
                    onChange={(event) =>
                      updateBuilderIdentity("businessHours", event.target.value)
                    }
                  />
                </Field>
                <Field label="Otro rubro">
                  <input
                    className={inputClass}
                    value={builderData.identity.otherCategory}
                    onChange={(event) =>
                      updateBuilderIdentity("otherCategory", event.target.value)
                    }
                  />
                </Field>
                <div className="md:col-span-2">
                  <TextAreaField
                    label="Objetivo del asistente"
                    value={builderData.identity.objective}
                    onChange={(event) =>
                      updateBuilderIdentity("objective", event.target.value)
                    }
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Que puede responder</h3>
                {capabilityDefinitions.map((item) => (
                  <div
                    key={item.key}
                    className="rounded-3xl border border-border bg-background-soft/40 p-4"
                  >
                    <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                      <input
                        checked={builderData.capabilities[item.key].enabled}
                        className="h-4 w-4 accent-[var(--accent)]"
                        type="checkbox"
                        onChange={(event) =>
                          updateCapability(item.key, "enabled", event.target.checked)
                        }
                      />
                      {item.label}
                    </label>
                    <textarea
                      className={`${inputClass} mt-3 min-h-24 w-full`}
                      value={builderData.capabilities[item.key].notes}
                      onChange={(event) =>
                        updateCapability(item.key, "notes", event.target.value)
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Tipo de cliente">
                  <input
                    className={inputClass}
                    value={builderData.audience.customerType}
                    onChange={(event) =>
                      updateBuilderAudience("customerType", event.target.value)
                    }
                  />
                </Field>
                <Field label="Edad aproximada">
                  <input
                    className={inputClass}
                    value={builderData.audience.ageRange}
                    onChange={(event) =>
                      updateBuilderAudience("ageRange", event.target.value)
                    }
                  />
                </Field>
                <Field label="Nivel tecnico">
                  <input
                    className={inputClass}
                    value={builderData.audience.technicalLevel}
                    onChange={(event) =>
                      updateBuilderAudience("technicalLevel", event.target.value)
                    }
                  />
                </Field>
                <Field label="Pais / region">
                  <input
                    className={inputClass}
                    value={builderData.audience.region}
                    onChange={(event) =>
                      updateBuilderAudience("region", event.target.value)
                    }
                  />
                </Field>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {toneDefinitions.map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-background-soft/35 px-4 py-3 text-sm text-foreground"
                  >
                    <input
                      checked={builderData.tone[item.key]}
                      className="h-4 w-4 accent-[var(--accent)]"
                      type="checkbox"
                      onChange={(event) =>
                        updateTone(item.key, event.target.checked)
                      }
                    />
                    {item.label}
                  </label>
                ))}
              </div>

              <div className="flex gap-3">
                <Button disabled={isSubmitting} onClick={saveBuilder}>
                  Guardar cambios
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
            Vista actual
          </p>
          <div className="space-y-3 text-sm text-foreground-muted">
            <p>
              Version activa: v{agent.activeVersion?.versionNumber ?? versions[0]?.versionNumber ?? 0}
            </p>
            <p>
              Tokens actuales:{" "}
              {agent.source === "MANUAL"
                ? manualTokens
                : estimateTokenCount(builderReview.prompt)}
            </p>
          </div>
          <TextAreaField
            className="min-h-72 font-mono text-xs"
            label="Prompt generado"
            readOnly
            value={agent.source === "MANUAL" ? manualInstructions : builderReview.prompt}
          />
        </Card>

        <Card className="space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
            Historial de versiones
          </p>
          <div className="space-y-3">
            {versions.map((version) => (
              <div
                key={version.id}
                className="rounded-2xl border border-border bg-background-soft/35 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">
                      v{version.versionNumber} · {sourceLabel(version.source)}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {new Date(version.createdAt).toLocaleString("es-PE")}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-accent">
                    {version.tokenEstimate} tokens
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-foreground-muted">
                  {version.promptExcerpt}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
