"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SelectField } from "@/components/ui/select-field";
import { StatCard } from "@/components/ui/stat-card";
import type {
  CampaignDetailResponse,
  CampaignsListResponse,
  CampaignListItem,
  CampaignStatusCode,
  DeleteCampaignResponse,
  ReconcileCampaignMessageResponse,
} from "@/lib/campaigns/types";

type RequestState = {
  loading: boolean;
  error: string | null;
};

type ReconciliationResolution = "CONFIRMED_SENT" | "CONFIRMED_NOT_SENT";

const UNKNOWN_PROVIDER_RESULT = "UNKNOWN_PROVIDER_RESULT";

const campaignStatusLabels: Record<CampaignStatusCode, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  RUNNING: "Running",
  PAUSED: "Paused",
  STOPPED: "Stopped",
  COMPLETED: "Completed",
  FAILED: "Failed",
  DELETING: "Deleting",
};

const campaignStatusTone: Record<CampaignStatusCode, string> = {
  DRAFT: "border-border text-foreground-muted",
  SCHEDULED: "border-sky-300/30 text-sky-200",
  RUNNING: "border-accent/50 text-accent",
  PAUSED: "border-amber-300/30 text-amber-200",
  STOPPED: "border-border-strong text-foreground-muted",
  COMPLETED: "border-emerald-300/30 text-emerald-200",
  FAILED: "border-rose-300/40 text-rose-200",
  DELETING: "border-rose-300/30 text-rose-200",
};

function summarizeMessage(value: string, maxLength = 72) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}...`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sin intentos";
  }

  return new Date(value).toLocaleString();
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error ?? "La operacion no pudo completarse.");
  }

  return data;
}

export function CampaignStatusClient() {
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [listState, setListState] = useState<RequestState>({
    loading: true,
    error: null,
  });
  const [detailState, setDetailState] = useState<RequestState>({
    loading: false,
    error: null,
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [reconcilingMessageId, setReconcilingMessageId] = useState<string | null>(
    null,
  );
  const [campaignDetail, setCampaignDetail] =
    useState<CampaignDetailResponse["campaign"] | null>(null);

  async function loadCampaigns(preferredCampaignId?: string) {
    setListState({ loading: true, error: null });

    try {
      const response = await fetch("/api/campaigns", {
        cache: "no-store",
      });
      const payload = await readJson<CampaignsListResponse>(response);
      setCampaigns(payload.campaigns);

      const nextSelectedId =
        preferredCampaignId &&
        payload.campaigns.some((campaign) => campaign.id === preferredCampaignId)
          ? preferredCampaignId
          : payload.campaigns[0]?.id ?? "";

      setSelectedCampaignId(nextSelectedId);
      setListState({ loading: false, error: null });
      return nextSelectedId;
    } catch (error) {
      setCampaigns([]);
      setSelectedCampaignId("");
      setCampaignDetail(null);
      setListState({
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las campanas.",
      });
      return "";
    }
  }

  async function loadCampaignDetail(campaignId: string) {
    if (!campaignId) {
      setCampaignDetail(null);
      setDetailState({ loading: false, error: null });
      return;
    }

    setDetailState({ loading: true, error: null });

    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        cache: "no-store",
      });
      const payload = await readJson<CampaignDetailResponse>(response);
      setCampaignDetail(payload.campaign);
      setDetailState({ loading: false, error: null });
    } catch (error) {
      setCampaignDetail(null);
      setDetailState({
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar la campana.",
      });
    }
  }

  async function refreshAll(preferredCampaignId?: string) {
    const nextId = await loadCampaigns(preferredCampaignId ?? selectedCampaignId);

    if (nextId) {
      await loadCampaignDetail(nextId);
      return;
    }

    setCampaignDetail(null);
  }

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCampaignId) {
      setCampaignDetail(null);
      return;
    }

    void loadCampaignDetail(selectedCampaignId);
  }, [selectedCampaignId]);

  async function handleRefresh() {
    await refreshAll();
  }

  async function handleDeleteCampaign() {
    if (!campaignDetail || isDeleting) {
      return;
    }

    const confirmed = window.confirm(
      `Eliminar la campana "${campaignDetail.name}"? Esta accion borrara sus mensajes asociados.`,
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/campaigns/${campaignDetail.id}`, {
        method: "DELETE",
      });
      await readJson<DeleteCampaignResponse>(response);
      await refreshAll();
    } catch (error) {
      setDetailState({
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo eliminar la campana.",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleReconcileMessage(
    messageId: string,
    resolution: ReconciliationResolution,
  ) {
    if (!campaignDetail || reconcilingMessageId) {
      return;
    }

    const resolutionLabel =
      resolution === "CONFIRMED_SENT"
        ? "CONFIRMADO COMO ENVIADO"
        : "CONFIRMADO COMO NO ENVIADO";
    const reason = window.prompt(
      `Reconciliacion manual: ${resolutionLabel}.\n\nDescribe la evidencia verificada (minimo 8 caracteres). Esta accion queda auditada.`,
    );

    if (reason === null) {
      return;
    }

    if (reason.trim().length < 8) {
      setDetailState({
        loading: false,
        error: "El motivo de reconciliacion debe tener al menos 8 caracteres.",
      });
      return;
    }

    const confirmed = window.confirm(
      resolution === "CONFIRMED_SENT"
        ? "Confirmas que verificaste evidencia y que este mensaje SI fue enviado por el proveedor? No se reenviara."
        : "Confirmas que verificaste evidencia y que este mensaje NO fue enviado por el proveedor? Volvera a PENDING, pero no se enviara hasta un Start explicito.",
    );

    if (!confirmed) {
      return;
    }

    setReconcilingMessageId(messageId);
    setDetailState({ loading: false, error: null });

    try {
      const response = await fetch(
        `/api/campaigns/${campaignDetail.id}/messages/${messageId}/reconcile`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            confirmed: true,
            resolution,
            reason: reason.trim(),
          }),
        },
      );

      await readJson<ReconcileCampaignMessageResponse>(response);
      await refreshAll(campaignDetail.id);
    } catch (error) {
      setDetailState({
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo reconciliar el resultado incierto.",
      });
    } finally {
      setReconcilingMessageId(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Campaign status"
        title="Estado de campanas"
        description="Monitorea el estado de cada campana guardada, revisa sus mensajes y elimina campanas que ya no deban permanecer en el workspace."
        actions={
          <>
            <Button onClick={handleRefresh} variant="secondary">
              Actualizar
            </Button>
            <Button
              disabled={!campaignDetail || isDeleting}
              onClick={handleDeleteCampaign}
            >
              {isDeleting ? "Eliminando..." : "Eliminar campana"}
            </Button>
          </>
        }
      />

      {listState.error ? (
        <Card className="border-rose-300/30 text-rose-100">{listState.error}</Card>
      ) : null}

      {detailState.error ? (
        <Card className="border-rose-300/30 text-rose-100">{detailState.error}</Card>
      ) : null}

      {listState.loading ? (
        <Card className="text-foreground-muted">Cargando campanas...</Card>
      ) : null}

      {!listState.loading && campaigns.length === 0 ? (
        <EmptyState
          title="Aun no hay campanas"
          description="Primero crea una campana desde el builder para ver aqui sus metricas y el detalle de mensajes."
          helper="La pantalla mostrara solo campanas del workspace autenticado."
        />
      ) : null}

      {!listState.loading && campaigns.length > 0 ? (
        <>
          <Card className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                Selector
              </p>
              <p className="text-sm leading-6 text-foreground-muted">
                Cambia de campana sin recargar la pagina. La lista usa una consulta
                liviana y el detalle se pide solo para la seleccion actual.
              </p>
            </div>
            <SelectField
              label="Campana"
              onChange={(event) => setSelectedCampaignId(event.target.value)}
              options={campaigns.map((campaign) => ({
                label: `${campaign.name} (${campaignStatusLabels[campaign.status]})`,
                value: campaign.id,
              }))}
              value={selectedCampaignId}
            />
          </Card>

          {campaignDetail ? (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  title="Numeros totales"
                  value={campaignDetail.totalCount.toString()}
                  change={`Estado ${campaignStatusLabels[campaignDetail.status]}`}
                />
                <StatCard
                  title="No enviados"
                  value={campaignDetail.pendingCount.toString()}
                  change="Pendientes o en cola"
                  tone="warm"
                />
                <StatCard
                  title="Enviados"
                  value={campaignDetail.sentCount.toString()}
                  change="Mensajes confirmados"
                />
                <StatCard
                  title="Fallidos"
                  value={campaignDetail.failedCount.toString()}
                  change="Requieren revision"
                  tone="danger"
                />
              </section>

              <Card className="space-y-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-semibold tracking-tight">
                        {campaignDetail.name}
                      </h2>
                      <span
                        className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] ${campaignStatusTone[campaignDetail.status]}`}
                      >
                        {campaignStatusLabels[campaignDetail.status]}
                      </span>
                    </div>
                    <p className="text-sm text-foreground-muted">
                      Instancia: {campaignDetail.instanceName ?? "Sin instancia"}. Zona
                      horaria: {campaignDetail.timezone}. Delay:{" "}
                      {campaignDetail.delaySeconds}s.
                    </p>
                  </div>
                  <p className="text-sm text-foreground-muted">
                    Ultima actualizacion: {formatDateTime(campaignDetail.updatedAt)}
                  </p>
                </div>

                {detailState.loading ? (
                  <div className="rounded-2xl border border-border bg-background-panel px-4 py-6 text-sm text-foreground-muted">
                    Cargando detalle de campana...
                  </div>
                ) : null}

                {!detailState.loading && campaignDetail.messages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border-strong bg-background-panel px-4 py-6 text-sm text-foreground-muted">
                    La campana no tiene mensajes asociados.
                  </div>
                ) : null}

                {!detailState.loading && campaignDetail.messages.length > 0 ? (
                  <div className="overflow-x-auto rounded-2xl border border-border">
                    <table className="min-w-full divide-y divide-border bg-background-panel text-sm">
                      <thead className="bg-background-soft text-left text-xs uppercase tracking-[0.18em] text-foreground-muted">
                        <tr>
                          <th className="px-4 py-3 font-medium">Telefono</th>
                          <th className="px-4 py-3 font-medium">Mensaje resumido</th>
                          <th className="px-4 py-3 font-medium">Estado</th>
                          <th className="px-4 py-3 font-medium">Intentos</th>
                          <th className="px-4 py-3 font-medium">Ultimo intento</th>
                          <th className="px-4 py-3 font-medium">Proveedor / error</th>
                          <th className="px-4 py-3 font-medium">Accion segura</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {campaignDetail.messages.map((message) => {
                          const needsReconciliation =
                            message.status === "FAILED" &&
                            message.lastErrorCode === UNKNOWN_PROVIDER_RESULT;
                          const isReconciling = reconcilingMessageId === message.id;

                          return (
                            <tr key={message.id} className="align-top">
                              <td className="px-4 py-4 font-mono text-xs text-foreground">
                                {message.recipientPhone}
                              </td>
                              <td className="px-4 py-4 text-foreground">
                                {summarizeMessage(message.messageTemplate)}
                              </td>
                              <td className="px-4 py-4">
                                <span className="rounded-full border border-border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-foreground-muted">
                                  {message.status}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-foreground-muted">
                                {message.attemptCount}
                              </td>
                              <td className="px-4 py-4 text-foreground-muted">
                                {formatDateTime(message.sentAt ?? message.updatedAt)}
                              </td>
                              <td className="px-4 py-4">
                                <div className="space-y-1">
                                  <p className={needsReconciliation ? "font-medium text-amber-200" : "text-rose-200"}>
                                    {message.lastErrorCode ?? "Sin codigo"}
                                  </p>
                                  <p className="max-w-sm text-xs leading-5 text-foreground-muted">
                                    {message.lastErrorMessage ?? "-"}
                                  </p>
                                  {message.providerMessageId ? (
                                    <p className="font-mono text-[11px] text-foreground-muted">
                                      ID proveedor: {message.providerMessageId}
                                    </p>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                {needsReconciliation ? (
                                  <div className="min-w-48 space-y-2">
                                    <p className="text-xs leading-5 text-amber-200">
                                      Resultado incierto: verifica evidencia externa antes de decidir.
                                    </p>
                                    <div className="flex flex-col gap-2">
                                      <Button
                                        disabled={Boolean(reconcilingMessageId)}
                                        onClick={() =>
                                          handleReconcileMessage(
                                            message.id,
                                            "CONFIRMED_SENT",
                                          )
                                        }
                                        variant="secondary"
                                      >
                                        {isReconciling
                                          ? "Reconciliando..."
                                          : "Confirmar enviado"}
                                      </Button>
                                      <Button
                                        disabled={Boolean(reconcilingMessageId)}
                                        onClick={() =>
                                          handleReconcileMessage(
                                            message.id,
                                            "CONFIRMED_NOT_SENT",
                                          )
                                        }
                                      >
                                        {isReconciling
                                          ? "Reconciliando..."
                                          : "Confirmar no enviado"}
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-xs text-foreground-muted">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </Card>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
