"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

type RecoveryEvent = {
  id: string;
  provider: string;
  providerEventId: string;
  payloadHashPrefix: string;
  status: string;
  action: string | null;
  duplicateCount: number;
  lastDuplicateAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  instanceId: string;
  instanceName: string;
};

type RecoveryDecision = "RETRY_ON_REDELIVERY" | "MARK_PROCESSED";

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "La operacion no pudo completarse.");
  }

  return payload;
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function statusLabel(status: string) {
  if (status === "STALE_REVIEW") return "Requiere revision";
  if (status === "RETRY_ALLOWED") return "Esperando redelivery";
  if (status === "PROCESSING") return "Procesando";
  return status;
}

function statusClasses(status: string) {
  if (status === "STALE_REVIEW") return "border-amber-300/40 text-amber-200";
  if (status === "RETRY_ALLOWED") return "border-sky-300/40 text-sky-200";
  return "border-emerald-300/30 text-emerald-200";
}

export function WebhookRecoveryClient() {
  const [events, setEvents] = useState<RecoveryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [lastSweep, setLastSweep] = useState<{
    markedCount: number;
    cutoff: string;
  } | null>(null);

  const reviewCount = useMemo(
    () => events.filter((event) => event.status === "STALE_REVIEW").length,
    [events],
  );
  const retryCount = useMemo(
    () => events.filter((event) => event.status === "RETRY_ALLOWED").length,
    [events],
  );
  const processingCount = useMemo(
    () => events.filter((event) => event.status === "PROCESSING").length,
    [events],
  );

  async function loadEvents() {
    setLoading(true);
    setError(null);

    try {
      const payload = await readJson<{ events: RecoveryEvent[] }>(
        await fetch("/api/webhooks/recovery", { cache: "no-store" }),
      );
      setEvents(payload.events);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo cargar recovery de webhooks.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents();
  }, []);

  async function sweepStale() {
    if (sweeping) return;

    const confirmed = window.confirm(
      "Detectar webhooks PROCESSING stale y moverlos a revision manual. Esta accion no reintenta ningun webhook.",
    );
    if (!confirmed) return;

    setSweeping(true);
    setError(null);

    try {
      const result = await readJson<{ markedCount: number; cutoff: string }>(
        await fetch("/api/webhooks/recovery", { method: "POST" }),
      );
      setLastSweep(result);
      await loadEvents();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo ejecutar el sweep.");
    } finally {
      setSweeping(false);
    }
  }

  async function decide(event: RecoveryEvent, decision: RecoveryDecision) {
    if (busyId) return;

    const reason = window.prompt(
      decision === "RETRY_ON_REDELIVERY"
        ? "Motivo para permitir recovery solo en una reentrega autentica con el mismo payload hash:"
        : "Motivo para marcar este webhook como procesado sin reintentarlo:",
      decision === "RETRY_ON_REDELIVERY"
        ? "Proveedor volvera a entregar el mismo evento"
        : "Resultado verificado externamente por el operador",
    );

    if (!reason?.trim()) return;

    const confirmed = window.confirm(
      decision === "RETRY_ON_REDELIVERY"
        ? "Autorizar retry en redelivery: WA Sender NO reproducira el payload. Solo aceptara una reentrega del proveedor con el mismo hash."
        : "Marcar como procesado: el evento quedara cerrado y una reentrega posterior se tratara como duplicado.",
    );
    if (!confirmed) return;

    setBusyId(event.id);
    setError(null);

    try {
      await readJson(
        await fetch(`/api/webhooks/recovery/${event.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            confirmed: true,
            reason: reason.trim(),
          }),
        }),
      );
      await loadEvents();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo aplicar la decision de recovery.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Webhook recovery"
        title="Recovery seguro de webhooks"
        description="Revisa eventos que pudieron quedar interrumpidos tras adquirir el claim. Nunca se hace replay ciego: un retry solo se ejecuta ante una reentrega autentica del proveedor con el mismo payload hash."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void loadEvents()} variant="secondary">
              Actualizar
            </Button>
            <Button disabled={sweeping} onClick={() => void sweepStale()}>
              {sweeping ? "Detectando..." : "Detectar stale"}
            </Button>
          </div>
        }
      />

      {error ? <Card className="border-rose-300/30 text-rose-100">{error}</Card> : null}

      {lastSweep ? (
        <Card className="border-emerald-300/20">
          <p className="text-sm text-foreground">
            Sweep completado: {lastSweep.markedCount} evento(s) enviados a revision.
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            Cutoff aplicado: {formatDateTime(lastSweep.cutoff)}
          </p>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-foreground-muted">Requieren revision</p>
          <p className="mt-2 text-3xl font-semibold">{reviewCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-foreground-muted">Esperando redelivery</p>
          <p className="mt-2 text-3xl font-semibold">{retryCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-foreground-muted">PROCESSING visibles</p>
          <p className="mt-2 text-3xl font-semibold">{processingCount}</p>
        </Card>
      </section>

      <Card className="border-amber-300/20">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-amber-200">
          Regla de seguridad
        </p>
        <p className="mt-2 text-sm leading-6 text-foreground-muted">
          Autorizar retry no envia ni reconstruye el webhook. El ledger queda esperando una reentrega real. Si el mismo providerEventId llega con un hash diferente, el recovery se bloquea y vuelve a revision manual.
        </p>
      </Card>

      {loading ? <Card className="text-foreground-muted">Cargando eventos...</Card> : null}

      {!loading && events.length === 0 ? (
        <EmptyState
          title="No hay webhooks pendientes de recovery"
          description="No existen eventos PROCESSING, STALE_REVIEW o RETRY_ALLOWED en este workspace."
          helper="Puedes ejecutar Detectar stale despues de un incidente o reinicio inesperado."
        />
      ) : null}

      {!loading && events.length > 0 ? (
        <div className="grid gap-4">
          {events.map((event) => (
            <Card key={event.id} className="space-y-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-semibold">{event.instanceName}</h2>
                    <span
                      className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${statusClasses(event.status)}`}
                    >
                      {statusLabel(event.status)}
                    </span>
                  </div>
                  <p className="mt-2 break-all text-sm text-foreground-muted">
                    {event.provider} · {event.providerEventId}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {event.status === "STALE_REVIEW" ? (
                    <Button
                      disabled={busyId === event.id}
                      onClick={() => void decide(event, "RETRY_ON_REDELIVERY")}
                    >
                      Esperar redelivery
                    </Button>
                  ) : null}
                  {event.status === "STALE_REVIEW" || event.status === "RETRY_ALLOWED" ? (
                    <Button
                      disabled={busyId === event.id}
                      onClick={() => void decide(event, "MARK_PROCESSED")}
                      variant="secondary"
                    >
                      Marcar procesado
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-border bg-background-panel p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-foreground-muted">Hash</p>
                  <p className="mt-1 font-mono text-sm">{event.payloadHashPrefix}…</p>
                </div>
                <div className="rounded-2xl border border-border bg-background-panel p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-foreground-muted">Duplicados</p>
                  <p className="mt-1 text-sm">{event.duplicateCount}</p>
                </div>
                <div className="rounded-2xl border border-border bg-background-panel p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-foreground-muted">Actualizado</p>
                  <p className="mt-1 text-sm">{formatDateTime(event.updatedAt)}</p>
                </div>
                <div className="rounded-2xl border border-border bg-background-panel p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-foreground-muted">Ultimo duplicado</p>
                  <p className="mt-1 text-sm">{formatDateTime(event.lastDuplicateAt)}</p>
                </div>
              </div>

              {event.action || event.errorMessage ? (
                <div className="rounded-2xl border border-border bg-background-panel px-4 py-3 text-sm">
                  {event.action ? (
                    <p>
                      <span className="text-foreground-muted">Accion:</span> {event.action}
                    </p>
                  ) : null}
                  {event.errorMessage ? (
                    <p className="mt-2 text-amber-100">{event.errorMessage}</p>
                  ) : null}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
