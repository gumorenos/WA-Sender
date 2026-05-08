"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { buildBuilderPrompt } from "@/lib/agents/prompt-builder";
import type { BuilderAgentInput } from "@/lib/agents/schemas";
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

const initialState: BuilderAgentInput = {
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

export function AgentBuilderForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<BuilderAgentInput>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const review = buildBuilderPrompt(data);

  function updateIdentity<K extends keyof BuilderAgentInput["identity"]>(
    key: K,
    value: BuilderAgentInput["identity"][K],
  ) {
    setData((current) => ({
      ...current,
      identity: {
        ...current.identity,
        [key]: value,
      },
    }));
  }

  function updateAudience<K extends keyof BuilderAgentInput["audience"]>(
    key: K,
    value: BuilderAgentInput["audience"][K],
  ) {
    setData((current) => ({
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
    setData((current) => ({
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
    setData((current) => ({
      ...current,
      tone: {
        ...current.tone,
        [key]: value,
      },
    }));
  }

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.8fr)]">
      <Card className="space-y-6">
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
            Paso {step} de 5
          </p>
          <h2 className="text-xl font-semibold tracking-tight">
            {step === 1
              ? "Identidad del agente"
              : step === 2
                ? "Que puede responder"
                : step === 3
                  ? "Audiencia"
                  : step === 4
                    ? "Tono y personalidad"
                    : "Revision final"}
          </h2>
        </div>

        {error ? (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-orange-100">
            {error}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Rubro/categoria">
              <input
                className={inputClass}
                placeholder="Ej. salud, inmobiliaria, dental"
                value={data.identity.category}
                onChange={(event) => updateIdentity("category", event.target.value)}
              />
            </Field>
            <Field label="Nombre del asistente">
              <input
                className={inputClass}
                placeholder="Ej. Recepcion Salud"
                value={data.identity.assistantName}
                onChange={(event) => updateIdentity("assistantName", event.target.value)}
              />
            </Field>
            <Field label="Nombre del negocio">
              <input
                className={inputClass}
                value={data.identity.businessName}
                onChange={(event) => updateIdentity("businessName", event.target.value)}
              />
            </Field>
            <Field label="Pagina web">
              <input
                className={inputClass}
                value={data.identity.website}
                onChange={(event) => updateIdentity("website", event.target.value)}
              />
            </Field>
            <Field label="Facebook">
              <input
                className={inputClass}
                value={data.identity.facebook}
                onChange={(event) => updateIdentity("facebook", event.target.value)}
              />
            </Field>
            <Field label="Instagram">
              <input
                className={inputClass}
                value={data.identity.instagram}
                onChange={(event) => updateIdentity("instagram", event.target.value)}
              />
            </Field>
            <Field label="Direccion">
              <input
                className={inputClass}
                value={data.identity.address}
                onChange={(event) => updateIdentity("address", event.target.value)}
              />
            </Field>
            <Field label="Horarios de atencion">
              <input
                className={inputClass}
                value={data.identity.businessHours}
                onChange={(event) => updateIdentity("businessHours", event.target.value)}
              />
            </Field>
            <Field label="Otro rubro">
              <input
                className={inputClass}
                value={data.identity.otherCategory}
                onChange={(event) => updateIdentity("otherCategory", event.target.value)}
              />
            </Field>
            <div className="md:col-span-2">
              <TextAreaField
                label="Objetivo del asistente"
                placeholder="Ej. Responder preguntas frecuentes, precalificar clientes y ayudar a concretar reservas."
                value={data.identity.objective}
                onChange={(event) => updateIdentity("objective", event.target.value)}
              />
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            {capabilityDefinitions.map((item) => (
              <div
                key={item.key}
                className="rounded-3xl border border-border bg-background-soft/40 p-4"
              >
                <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                  <input
                    checked={data.capabilities[item.key].enabled}
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
                  placeholder="Detalle opcional para afinar este tema."
                  value={data.capabilities[item.key].notes}
                  onChange={(event) =>
                    updateCapability(item.key, "notes", event.target.value)
                  }
                />
              </div>
            ))}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tipo de cliente">
              <input
                className={inputClass}
                value={data.audience.customerType}
                onChange={(event) => updateAudience("customerType", event.target.value)}
              />
            </Field>
            <Field label="Edad aproximada">
              <input
                className={inputClass}
                value={data.audience.ageRange}
                onChange={(event) => updateAudience("ageRange", event.target.value)}
              />
            </Field>
            <Field label="Nivel tecnico">
              <input
                className={inputClass}
                value={data.audience.technicalLevel}
                onChange={(event) => updateAudience("technicalLevel", event.target.value)}
              />
            </Field>
            <Field label="Pais / region">
              <input
                className={inputClass}
                value={data.audience.region}
                onChange={(event) => updateAudience("region", event.target.value)}
              />
            </Field>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {toneDefinitions.map((item) => (
              <label
                key={item.key}
                className="flex items-center gap-3 rounded-2xl border border-border bg-background-soft/35 px-4 py-3 text-sm text-foreground"
              >
                <input
                  checked={data.tone[item.key]}
                  className="h-4 w-4 accent-[var(--accent)]"
                  type="checkbox"
                  onChange={(event) => updateTone(item.key, event.target.checked)}
                />
                {item.label}
              </label>
            ))}
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-4">
            <TextAreaField
              className="min-h-80 font-mono text-xs"
              label="Instrucciones completas generadas"
              readOnly
              value={review.prompt}
            />
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">
                JSON que se guardara
              </span>
              <textarea
                className={`${inputClass} min-h-80 font-mono text-xs`}
                readOnly
                value={JSON.stringify(review.config, null, 2)}
              />
            </label>
          </div>
        ) : null}

        <div className="flex gap-3">
          <Button
            disabled={step === 1 || isSubmitting}
            type="button"
            variant="secondary"
            onClick={() => setStep((current) => current - 1)}
          >
            Anterior
          </Button>
          {step < 5 ? (
            <Button type="button" onClick={() => setStep((current) => current + 1)}>
              Siguiente
            </Button>
          ) : (
            <Button disabled={isSubmitting} type="button" onClick={handleSubmit}>
              Crear agente
            </Button>
          )}
        </div>
      </Card>

      <Card className="space-y-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
          Resumen
        </p>
        <div className="space-y-3 text-sm text-foreground-muted">
          <p>Nombre: {data.identity.assistantName || "Sin definir"}</p>
          <p>Negocio: {data.identity.businessName || "Sin definir"}</p>
          <p>
            Temas activos:{" "}
            {
              capabilityDefinitions.filter(
                (item) => data.capabilities[item.key].enabled,
              ).length
            }
          </p>
          <p>
            Rasgos de tono:{" "}
            {
              toneDefinitions.filter((item) => data.tone[item.key]).length
            }
          </p>
          <p>
            El prompt se construye con template fijo. No se usa LLM para esta
            etapa.
          </p>
        </div>
      </Card>
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
