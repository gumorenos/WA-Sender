"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type CampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "STOPPED"
  | "FAILED"
  | "DELETING";

type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  totalCount: number;
  pendingCount: number;
  sentCount: number;
  failedCount: number;
  instanceId: string | null;
  instanceName: string | null;
  scheduledStartAt: string | null;
  timezone: string;
  activeWindowStart: string | null;
  activeWindowEnd: string | null;
  delaySeconds: number;
};

type Instance = {
  id: string;
  name: string;
  status: string;
};

const TIMEZONES = [
  "America/Lima",
  "America/Bogota",
  "America/Mexico_City",
  "America/Argentina/Buenos_Aires",
  "America/Santiago",
  "America/New_York",
];

const fieldClass =
  "rounded-2xl border border-border bg-background-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/60";

function toDatetimeLocal(value: Date) {
  const offsetMs = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offsetMs).toISOString().slice(0, 16);
}

function isoFromDatetimeLocal(value: string) {
  return new Date(value).toISOString();
}

function statusLabel(status: CampaignStatus) {
  const labels: Record<CampaignStatus, string> = {
    COMPLETED: "Completada",
    DELETING: "Eliminando",
    DRAFT: "Borrador",
    FAILED: "Fallida",
    PAUSED: "Pausada",
    RUNNING: "En ejecucion",
    SCHEDULED: "Programada",
    STOPPED: "Detenida",
  };

  return labels[status];
}

export function CampaignSendClient() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [selectedInstanceId, setSelectedInstanceId] = useState("");
  const [scheduledStartAt, setScheduledStartAt] = useState(() =>
    toDatetimeLocal(new Date(Date.now() + 5 * 60_000)),
  );
  const [activeWindowStart, setActiveWindowStart] = useState("09:00");
  const [activeWindowEnd, setActiveWindowEnd] = useState("18:00");
  const [timezone, setTimezone] = useState("America/Lima");
  const [delaySeconds, setDelaySeconds] = useState(45);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId],
  );

  async function loadData() {
    setIsLoading(true);
    setError(null);

    try {
      const [campaignResponse, instanceResponse] = await Promise.all([
        fetch("/api/campaigns", { cache: "no-store" }),
        fetch("/api/instances?status=active", { cache: "no-store" }),
      ]);

      const campaignJson = await campaignResponse.json();
      const instanceJson = await instanceResponse.json();

      if (!campaignResponse.ok) {
        throw new Error(campaignJson.error ?? "No se pudieron cargar campanas.");
      }

      if (!instanceResponse.ok) {
        throw new Error(instanceJson.error ?? "No se pudieron cargar instancias.");
      }

      const nextCampaigns = campaignJson.campaigns ?? [];
      const nextInstances = instanceJson.instances ?? [];

      setCampaigns(nextCampaigns);
      setInstances(nextInstances);

      setSelectedCampaignId((current) => current || nextCampaigns[0]?.id || "");
      setSelectedInstanceId((current) => current || nextInstances[0]?.id || "");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar datos.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedCampaign) {
      return;
    }

    setSelectedInstanceId((current) => current || selectedCampaign.instanceId || "");
    setTimezone(selectedCampaign.timezone || "America/Lima");
    setActiveWindowStart(selectedCampaign.activeWindowStart || "09:00");
    setActiveWindowEnd(selectedCampaign.activeWindowEnd || "18:00");
    setDelaySeconds(selectedCampaign.delaySeconds || 45);

    if (selectedCampaign.scheduledStartAt) {
      setScheduledStartAt(toDatetimeLocal(new Date(selectedCampaign.scheduledStartAt)));
    }
  }, [selectedCampaign]);

  async function runAction(action: "start" | "pause" | "resume" | "stop") {
    if (!selectedCampaignId) {
      setError("Selecciona una campana.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setNotice(null);

    const body =
      action === "start"
        ? {
            instanceId: selectedInstanceId,
            scheduledStartAt: isoFromDatetimeLocal(scheduledStartAt),
            activeWindowStart,
            activeWindowEnd,
            timezone,
            delaySeconds,
          }
        : undefined;

    try {
      const response = await fetch(`/api/campaigns/${selectedCampaignId}/${action}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "No se pudo ejecutar la accion.");
      }

      setNotice("Accion aplicada correctamente.");
      await loadData();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "No se pudo ejecutar la accion.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <Card>Cargando campanas e instancias...</Card>;
  }

  if (campaigns.length === 0) {
    return (
      <EmptyState
        title="No hay campanas para enviar"
        description="Primero crea una campana con mensajes pendientes. Esta pantalla solo programa y controla el envio."
        actionLabel="Crear campana"
      />
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
      <Card className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">
            Configuracion de envio
          </h2>
          <p className="text-sm leading-6 text-foreground-muted">
            El worker enviara de forma secuencial, con horario activo, delay
            obligatorio y bloqueo para opt-out registrado.
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

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">Campana</span>
            <select
              className={fieldClass}
              value={selectedCampaignId}
              onChange={(event) => setSelectedCampaignId(event.target.value)}
            >
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name} - {statusLabel(campaign.status)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">
              Instancia WhatsApp activa
            </span>
            <select
              className={fieldClass}
              value={selectedInstanceId}
              onChange={(event) => setSelectedInstanceId(event.target.value)}
            >
              <option value="">Selecciona una instancia</option>
              {instances.map((instance) => (
                <option key={instance.id} value={instance.id}>
                  {instance.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">
              Fecha de inicio
            </span>
            <input
              className={fieldClass}
              type="datetime-local"
              value={scheduledStartAt}
              onChange={(event) => setScheduledStartAt(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">
              Zona horaria
            </span>
            <select
              className={fieldClass}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            >
              {TIMEZONES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">
              Hora activa desde
            </span>
            <input
              className={fieldClass}
              type="time"
              value={activeWindowStart}
              onChange={(event) => setActiveWindowStart(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">
              Hora activa hasta
            </span>
            <input
              className={fieldClass}
              type="time"
              value={activeWindowEnd}
              onChange={(event) => setActiveWindowEnd(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">
              Delay entre mensajes
            </span>
            <input
              className={fieldClass}
              min={30}
              step={5}
              type="number"
              value={delaySeconds}
              onChange={(event) => setDelaySeconds(Number(event.target.value))}
            />
            <span className="text-xs text-foreground-muted">
              El plan puede exigir un minimo mayor.
            </span>
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            disabled={isSubmitting || !selectedInstanceId}
            onClick={() => runAction("start")}
          >
            Iniciar campana
          </Button>
          <Button
            disabled={
              isSubmitting ||
              !selectedCampaign ||
              !["RUNNING", "SCHEDULED"].includes(selectedCampaign.status)
            }
            variant="secondary"
            onClick={() => runAction("pause")}
          >
            Pausar
          </Button>
          <Button
            disabled={
              isSubmitting ||
              !selectedCampaign ||
              selectedCampaign.status !== "PAUSED"
            }
            variant="secondary"
            onClick={() => runAction("resume")}
          >
            Reanudar
          </Button>
          <Button
            disabled={
              isSubmitting ||
              !selectedCampaign ||
              !["RUNNING", "SCHEDULED", "PAUSED"].includes(selectedCampaign.status)
            }
            variant="ghost"
            onClick={() => runAction("stop")}
          >
            Detener
          </Button>
          <Button disabled={isSubmitting} variant="ghost" onClick={loadData}>
            Actualizar
          </Button>
        </div>
      </Card>

      <Card className="space-y-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
            Resumen
          </p>
          <h3 className="mt-2 text-lg font-semibold">
            {selectedCampaign?.name ?? "Sin campana"}
          </h3>
          <p className="mt-1 text-sm text-foreground-muted">
            Estado:{" "}
            {selectedCampaign ? statusLabel(selectedCampaign.status) : "N/A"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Metric label="Total" value={selectedCampaign?.totalCount ?? 0} />
          <Metric label="Pendientes" value={selectedCampaign?.pendingCount ?? 0} />
          <Metric label="Enviados" value={selectedCampaign?.sentCount ?? 0} />
          <Metric label="Fallidos" value={selectedCampaign?.failedCount ?? 0} />
        </div>

        <div className="rounded-2xl border border-border bg-background-soft/45 p-4 text-sm leading-6 text-foreground-muted">
          No se envia nada desde el navegador. La accion solo actualiza la
          campana y encola el trabajo; el worker valida estado, horario,
          consentimiento y limite antes de cada mensaje.
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-background-soft/50 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-foreground-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
