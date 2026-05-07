"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SelectField } from "@/components/ui/select-field";
import type {
  InstanceQrResponse,
  InstancesListResponse,
  InstanceStatusResponse,
  PublicInstanceStatus,
  PublicWhatsAppInstance,
} from "@/lib/instances/types";

type StatusFilter = "all" | "active" | "connecting" | "disconnected";

type RequestState = {
  loading: boolean;
  error: string | null;
};

const statusLabels: Record<PublicInstanceStatus, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting",
  open: "Open",
  error: "Error",
};

const statusClassNames: Record<PublicInstanceStatus, string> = {
  disconnected: "border-border text-foreground-muted",
  connecting: "border-amber-300/40 text-amber-200",
  open: "border-accent/60 text-accent",
  error: "border-rose-300/50 text-rose-200",
};

const filterOptions = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "connecting", label: "Conectando" },
  { value: "disconnected", label: "Desconectados" },
];

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error ?? "La operacion no pudo completarse.");
  }

  return data;
}

export function InstancesClient() {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [data, setData] = useState<InstancesListResponse | null>(null);
  const [listState, setListState] = useState<RequestState>({
    loading: true,
    error: null,
  });
  const [createName, setCreateName] = useState("");
  const [createState, setCreateState] = useState<RequestState>({
    loading: false,
    error: null,
  });
  const [selectedInstance, setSelectedInstance] =
    useState<PublicWhatsAppInstance | null>(null);
  const [qrState, setQrState] = useState<RequestState>({
    loading: false,
    error: null,
  });
  const [qr, setQr] = useState<InstanceQrResponse | null>(null);

  const canCreate = useMemo(() => {
    if (!data) {
      return false;
    }

    return data.usage.used < data.usage.limit;
  }, [data]);

  async function loadInstances(nextFilter = filter) {
    setListState({ loading: true, error: null });

    try {
      const response = await fetch(`/api/instances?status=${nextFilter}`, {
        cache: "no-store",
      });
      const payload = await readJson<InstancesListResponse>(response);
      setData(payload);
    } catch (error) {
      setListState({
        loading: false,
        error: error instanceof Error ? error.message : "Error inesperado.",
      });
      return;
    }

    setListState({ loading: false, error: null });
  }

  useEffect(() => {
    void loadInstances(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function handleCreate() {
    setCreateState({ loading: true, error: null });

    try {
      const response = await fetch("/api/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName }),
      });
      const payload = await readJson<{ instance: PublicWhatsAppInstance }>(
        response,
      );
      setCreateName("");
      setSelectedInstance(payload.instance);
      await loadQr(payload.instance);
      await loadInstances(filter);
    } catch (error) {
      setCreateState({
        loading: false,
        error: error instanceof Error ? error.message : "Error inesperado.",
      });
      return;
    }

    setCreateState({ loading: false, error: null });
  }

  async function loadQr(instance: PublicWhatsAppInstance) {
    setQrState({ loading: true, error: null });
    setQr(null);

    try {
      const response = await fetch(`/api/instances/${instance.id}/qr`, {
        cache: "no-store",
      });
      const payload = await readJson<InstanceQrResponse>(response);
      setQr(payload);
      setSelectedInstance({ ...instance, status: payload.status });
    } catch (error) {
      setQrState({
        loading: false,
        error: error instanceof Error ? error.message : "Error inesperado.",
      });
      return;
    }

    setQrState({ loading: false, error: null });
  }

  async function refreshStatus(instance: PublicWhatsAppInstance) {
    try {
      const response = await fetch(`/api/instances/${instance.id}/status`, {
        cache: "no-store",
      });
      const payload = await readJson<InstanceStatusResponse>(response);
      const nextInstance = { ...instance, status: payload.status };
      setSelectedInstance((current) =>
        current?.id === instance.id ? nextInstance : current,
      );
      setData((current) =>
        current
          ? {
              ...current,
              instances: current.instances.map((item) =>
                item.id === instance.id ? nextInstance : item,
              ),
            }
          : current,
      );
    } catch {
      setSelectedInstance((current) =>
        current?.id === instance.id ? { ...current, status: "error" } : current,
      );
    }
  }

  async function handleDelete(instance: PublicWhatsAppInstance) {
    const confirmed = window.confirm(
      `Eliminar la instancia "${instance.name}"? Esta accion tambien intentara eliminarla en Evolution API.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/instances/${instance.id}`, {
        method: "DELETE",
      });
      await readJson<{ ok: boolean }>(response);
      if (selectedInstance?.id === instance.id) {
        setSelectedInstance(null);
        setQr(null);
      }
      await loadInstances(filter);
    } catch (error) {
      setListState({
        loading: false,
        error: error instanceof Error ? error.message : "No se pudo eliminar.",
      });
    }
  }

  useEffect(() => {
    if (!selectedInstance || selectedInstance.status === "open") {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshStatus(selectedInstance);
    }, 4_000);

    return () => window.clearInterval(interval);
  }, [selectedInstance]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="WhatsApp instances"
        title="Instancias y vinculacion"
        description="Crea instancias de WhatsApp con Evolution API, vincula por QR y consulta el estado sin exponer secretos al navegador."
        actions={
          <Button
            disabled={!canCreate || createState.loading}
            onClick={handleCreate}
          >
            {createState.loading ? "Creando..." : "Crear instancia"}
          </Button>
        }
      />

      <Card className="grid gap-5 lg:grid-cols-[1fr_220px] lg:items-end">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">
            Nombre de instancia
          </span>
          <input
            className="rounded-2xl border border-border bg-background-panel px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-foreground-muted focus:border-accent/60"
            disabled={!canCreate || createState.loading}
            onChange={(event) => setCreateName(event.target.value)}
            placeholder="ventas_lima"
            value={createName}
          />
          <span className="text-xs text-foreground-muted">
            Solo letras, numeros, guiones y guiones bajos. Limite del plan:
            {" "}
            {data ? `${data.usage.used}/${data.usage.limit}` : "..."}.
          </span>
        </label>

        <SelectField
          label="Filtrar por estado"
          onChange={(event) => setFilter(event.target.value as StatusFilter)}
          options={filterOptions}
          value={filter}
        />

        {createState.error ? (
          <p className="lg:col-span-2 text-sm text-rose-200">
            {createState.error}
          </p>
        ) : null}
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-foreground-muted">
            Uso del plan
          </p>
          <p className="mt-3 text-3xl font-semibold">
            {data ? `${data.usage.used}/${data.usage.limit}` : "..."}
          </p>
          <p className="mt-2 text-sm text-foreground-muted">
            {data?.plan.name ?? "Plan actual"}
          </p>
        </Card>
        <Card>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-foreground-muted">
            Activas
          </p>
          <p className="mt-3 text-3xl font-semibold">
            {data?.instances.filter((item) => item.status === "open").length ?? 0}
          </p>
          <p className="mt-2 text-sm text-foreground-muted">
            Estado confirmado por backend.
          </p>
        </Card>
        <Card>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-foreground-muted">
            Seguridad
          </p>
          <p className="mt-3 text-sm leading-6 text-foreground-muted">
            La UI no recibe tokens ni URLs internas de Evolution API.
          </p>
        </Card>
      </div>

      {listState.error ? (
        <Card className="border-rose-300/40 text-rose-100">{listState.error}</Card>
      ) : null}

      {listState.loading ? (
        <Card className="text-foreground-muted">Cargando instancias...</Card>
      ) : null}

      {!listState.loading && data?.instances.length === 0 ? (
        <EmptyState
          title="Aun no hay instancias"
          description="Crea tu primera instancia para generar un QR y vincular WhatsApp mediante Evolution API o modo mock."
          actionLabel="Modo mock disponible"
          helper="Configura EVOLUTION_MOCK=true para probar sin Evolution API real."
        />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        {data?.instances.map((instance) => (
          <Card key={instance.id} className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold tracking-tight">
                  {instance.name}
                </h2>
                <p className="text-sm text-foreground-muted">
                  Provider: {instance.provider}
                </p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] ${statusClassNames[instance.status]}`}
              >
                {statusLabels[instance.status]}
              </span>
            </div>

            <div className="rounded-3xl border border-dashed border-border-strong bg-background-soft p-6">
              <div className="mx-auto flex aspect-square max-w-[180px] items-center justify-center rounded-2xl bg-background text-center">
                <span className="px-4 font-mono text-xs uppercase tracking-[0.2em] text-foreground-muted">
                  QR privado en modal
                </span>
              </div>
            </div>

            <p className="text-sm leading-6 text-foreground-muted">
              Ultimo estado: {instance.lastStatusAt ? new Date(instance.lastStatusAt).toLocaleString() : "sin consulta"}.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              <Button
                className="sm:col-span-1"
                onClick={() => {
                  setSelectedInstance(instance);
                  void loadQr(instance);
                }}
                variant="secondary"
              >
                QR
              </Button>
              <Button
                className="sm:col-span-1"
                onClick={() => void refreshStatus(instance)}
              >
                Estado
              </Button>
              <Button
                className="sm:col-span-1"
                onClick={() => void handleDelete(instance)}
                variant="ghost"
              >
                Eliminar
              </Button>
            </div>
          </Card>
        ))}
      </section>

      {selectedInstance ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8 backdrop-blur">
          <Card className="w-full max-w-lg space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                  Vincular dispositivo
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {selectedInstance.name}
                </h2>
              </div>
              <button
                className="rounded-full border border-border px-3 py-1 text-sm text-foreground-muted transition hover:text-foreground"
                onClick={() => {
                  setSelectedInstance(null);
                  setQr(null);
                }}
              >
                Cerrar
              </button>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-border bg-background-panel px-4 py-3">
              <span className="text-sm text-foreground-muted">Estado</span>
              <span
                className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] ${statusClassNames[selectedInstance.status]}`}
              >
                {statusLabels[selectedInstance.status]}
              </span>
            </div>

            <div className="rounded-3xl border border-border bg-white p-4">
              {qrState.loading ? (
                <div className="flex aspect-square items-center justify-center rounded-2xl bg-slate-100 text-sm text-slate-500">
                  Generando QR...
                </div>
              ) : qr?.qrBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={`QR de ${selectedInstance.name}`}
                  className="mx-auto aspect-square w-full max-w-[320px]"
                  src={qr.qrBase64}
                />
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-2xl bg-slate-100 px-8 text-center text-sm text-slate-500">
                  QR no disponible todavia. Actualiza estado o intenta refrescar QR.
                </div>
              )}
            </div>

            {qr?.pairingCode ? (
              <p className="rounded-2xl border border-border bg-background-panel p-3 font-mono text-xs text-foreground-muted">
                Pairing code: {qr.pairingCode}
              </p>
            ) : null}

            {qrState.error ? (
              <p className="text-sm text-rose-200">{qrState.error}</p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                onClick={() => void loadQr(selectedInstance)}
                variant="secondary"
              >
                Refrescar QR
              </Button>
              <Button onClick={() => void refreshStatus(selectedInstance)}>
                Actualizar estado
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
