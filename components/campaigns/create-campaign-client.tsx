"use client";

import { useDeferredValue, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SelectField } from "@/components/ui/select-field";
import { TextAreaField } from "@/components/ui/text-area-field";
import { parseCampaignInput } from "@/lib/campaign-parser";
import type { CreateCampaignResponse } from "@/lib/campaigns/types";
import type { InstancesListResponse } from "@/lib/instances/types";

type ActiveInstanceOption = {
  label: string;
  value: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error ?? "La operacion no pudo completarse.");
  }

  return data;
}

const formatExamples = [
  "+51 999 888 777\tHola {nombre}, te escribo desde Lima.",
  "+52 55 1234 5678,Hola {nombre}, seguimos tu solicitud en Mexico.",
  "+54 9 11 2345 6789    Hola {nombre}, confirmamos el contacto en Argentina.",
  "+57 300 123 4567\tHola {nombre}, este es el seguimiento en Colombia.",
];

export function CreateCampaignClient() {
  const [campaignName, setCampaignName] = useState("");
  const [instanceId, setInstanceId] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [instances, setInstances] = useState<ActiveInstanceOption[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(true);
  const [instancesError, setInstancesError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const deferredInput = useDeferredValue(rawInput);
  const preview = parseCampaignInput(deferredInput);

  useEffect(() => {
    let cancelled = false;

    async function loadInstances() {
      setInstancesLoading(true);
      setInstancesError(null);

      try {
        const response = await fetch("/api/instances?status=active", {
          cache: "no-store",
        });
        const payload = await readJson<InstancesListResponse>(response);

        if (cancelled) {
          return;
        }

        const options = payload.instances.map((instance) => ({
          label: `${instance.name} (${instance.provider})`,
          value: instance.id,
        }));

        setInstances(options);
        setInstanceId((current) => current || options[0]?.value || "");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setInstancesError(
          error instanceof Error
            ? error.message
            : "No se pudo cargar la lista de instancias.",
        );
      } finally {
        if (!cancelled) {
          setInstancesLoading(false);
        }
      }
    }

    void loadInstances();

    return () => {
      cancelled = true;
    };
  }, []);

  const canSave =
    !isPending &&
    campaignName.trim().length >= 3 &&
    !!instanceId &&
    preview.rows.length > 0 &&
    preview.errors.length === 0;

  function handleClear() {
    setCampaignName("");
    setRawInput("");
    setSaveError(null);
    setSaveSuccess(null);
  }

  function handleSave() {
    setSaveError(null);
    setSaveSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/campaigns", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: campaignName,
            instanceId,
            rawInput,
          }),
        });

        const payload = await readJson<CreateCampaignResponse>(response);
        setSaveSuccess(
          `Campaña guardada con ${payload.campaign.totalCount} mensajes pendientes.`,
        );
        setCampaignName("");
        setRawInput("");
      } catch (error) {
        setSaveError(
          error instanceof Error ? error.message : "No se pudo guardar la campaña.",
        );
      }
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Campaign builder"
        title="Crear campaña"
        description="Pega filas desde Excel o Google Sheets, valida números internacionales y guarda la campaña en estado draft sin enviar todavía."
        actions={
          <>
            <Button onClick={handleClear} variant="ghost">
              Limpiar
            </Button>
            <Button disabled={!canSave} onClick={handleSave}>
              {isPending ? "Guardando..." : "Guardar campaña"}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.95fr)]">
        <div className="space-y-6">
          <Card className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">
                  Nombre de campaña
                </span>
                <input
                  className="rounded-2xl border border-border bg-background-panel px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-foreground-muted focus:border-accent/60"
                  onChange={(event) => setCampaignName(event.target.value)}
                  placeholder="seguimiento_mayo"
                  value={campaignName}
                />
              </label>

              <SelectField
                disabled={instancesLoading || instances.length === 0}
                hint={
                  instancesLoading
                    ? "Cargando instancias activas..."
                    : "Solo se muestran instancias activas del workspace actual."
                }
                label="Instancia WhatsApp activa"
                onChange={(event) => setInstanceId(event.target.value)}
                options={
                  instances.length > 0
                    ? instances
                    : [{ label: "Sin instancias activas", value: "" }]
                }
                value={instanceId}
              />
            </div>

            <TextAreaField
              className="min-h-[320px]"
              hint="Usa tab, coma o espacios múltiples entre número y mensaje. El mensaje conserva espacios, emojis y formato WhatsApp."
              label="Datos pegados"
              onChange={(event) => setRawInput(event.target.value)}
              placeholder={formatExamples.join("\n")}
              value={rawInput}
            />

            {instancesError ? (
              <p className="text-sm text-rose-200">{instancesError}</p>
            ) : null}
            {saveError ? <p className="text-sm text-rose-200">{saveError}</p> : null}
            {saveSuccess ? (
              <p className="text-sm text-accent">{saveSuccess}</p>
            ) : null}
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                  Preview
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">
                  Registros parseados
                </h2>
              </div>
              <div className="text-right text-sm text-foreground-muted">
                <p>{preview.rows.length} filas válidas</p>
                <p>{preview.errors.length} errores</p>
              </div>
            </div>

            {preview.rows.length === 0 ? (
              <EmptyState
                actionLabel="Sin filas válidas aún"
                description="Pega datos con dos columnas para revisar el preview antes de guardar."
                helper="La campaña solo se guarda cuando todas las filas útiles son válidas."
                title="Preview vacío"
              />
            ) : (
              <div className="space-y-3">
                {preview.rows.slice(0, 8).map((row) => (
                  <div
                    className="rounded-2xl border border-border bg-background-panel p-4"
                    key={`${row.line}-${row.phone}`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
                        Línea {row.line}
                      </span>
                      <span className="text-xs text-foreground-muted">
                        {row.phone}
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">
                      {row.message}
                    </p>
                  </div>
                ))}

                {preview.rows.length > 8 ? (
                  <p className="text-sm text-foreground-muted">
                    Se muestran 8 filas. El guardado incluirá {preview.rows.length}.
                  </p>
                ) : null}
              </div>
            )}

            {preview.errors.length > 0 ? (
              <div className="space-y-3 rounded-3xl border border-rose-300/30 bg-rose-950/20 p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-rose-200">
                  Errores por línea
                </p>
                {preview.errors.map((error) => (
                  <div
                    className="rounded-2xl border border-rose-300/20 bg-black/10 p-3"
                    key={`${error.line}-${error.code}`}
                  >
                    <p className="text-sm font-medium text-rose-100">
                      Línea {error.line}: {error.message}
                    </p>
                    <p className="mt-2 break-all font-mono text-xs text-rose-200/80">
                      {error.raw}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
              Formato esperado
            </p>
            <p className="text-sm leading-6 text-foreground-muted">
              Columna 1: número de WhatsApp con código internacional. Columna 2:
              mensaje completo.
            </p>
            <div className="rounded-2xl border border-border bg-background-panel p-4 font-mono text-xs leading-7 text-foreground-muted">
              {formatExamples.map((example) => (
                <div key={example}>{example}</div>
              ))}
            </div>
          </Card>

          <Card className="space-y-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
              Reglas del parser
            </p>
            <div className="space-y-3 text-sm leading-6 text-foreground-muted">
              <p>Se omiten líneas vacías.</p>
              <p>Se aceptan separadores por tab, coma o espacios múltiples.</p>
              <p>El número se limpia y se normaliza a formato internacional.</p>
              <p>El mensaje conserva espacios, emojis y formato WhatsApp.</p>
              <p>Si existe al menos un error, no se guarda la campaña.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
