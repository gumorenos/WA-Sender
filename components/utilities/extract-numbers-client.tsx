"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectField } from "@/components/ui/select-field";
import { downloadCsv, downloadXlsx, type TabularRow } from "@/lib/export/tabular";
import type {
  InstancesListResponse,
  PublicWhatsAppInstance,
} from "@/lib/instances/types";

type ExtractSource = "contacts" | "chats";

type ExtractedRow = {
  number: string;
  displayName: string | null;
  source: ExtractSource;
  isSaved: boolean;
  lastSeenOrUpdatedAt: string | null;
  consentStatus: "unknown";
  optInStatus: "unknown";
};

type ExtractResponse = {
  records: ExtractedRow[];
  summary: {
    raw: number;
    returned: number;
    mocked: boolean;
    consentStatus: "unknown";
  };
  privacy: {
    canUseInCampaign: boolean;
    message: string;
  };
};

const exportColumns = [
  "number",
  "display_name",
  "source",
  "is_saved",
  "last_seen_or_updated_at",
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

function toExportRows(rows: ExtractedRow[]): TabularRow[] {
  return rows.map((row) => ({
    number: row.number,
    display_name: row.displayName ?? "",
    source: row.source,
    is_saved: row.isSaved ? "yes" : "no",
    last_seen_or_updated_at: row.lastSeenOrUpdatedAt ?? "",
  }));
}

export function ExtractNumbersClient() {
  const [instances, setInstances] = useState<PublicWhatsAppInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState("");
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [omitGroups, setOmitGroups] = useState(true);
  const [omitMissingPhones, setOmitMissingPhones] = useState(true);
  const [dedupe, setDedupe] = useState(true);
  const [records, setRecords] = useState<ExtractedRow[]>([]);
  const [summary, setSummary] = useState<ExtractResponse["summary"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [isLoadingInstances, setIsLoadingInstances] = useState(true);
  const [isExtracting, setIsExtracting] = useState<ExtractSource | null>(null);

  const activeInstances = useMemo(
    () => instances.filter((instance) => instance.status === "open"),
    [instances],
  );
  const selectableInstances = activeInstances.length > 0 ? activeInstances : instances;
  const exportRows = useMemo(() => toExportRows(records), [records]);

  useEffect(() => {
    async function loadInstances() {
      setIsLoadingInstances(true);
      setError(null);

      try {
        const response = await fetch("/api/instances", { cache: "no-store" });
        const payload = await readJson<InstancesListResponse>(response);
        setInstances(payload.instances);
        setSelectedInstanceId((current) => current || payload.instances[0]?.id || "");
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron cargar las instancias.",
        );
      } finally {
        setIsLoadingInstances(false);
      }
    }

    loadInstances();
  }, []);

  async function extract(source: ExtractSource) {
    if (!selectedInstanceId || !privacyConfirmed) {
      return;
    }

    setIsExtracting(source);
    setError(null);
    setCopyMessage(null);

    try {
      const response = await fetch("/api/utilities/extract-numbers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instanceId: selectedInstanceId,
          source,
          filters: {
            omitGroups,
            omitMissingPhones,
            dedupe,
          },
          privacyConfirmed,
        }),
      });
      const payload = await readJson<ExtractResponse>(response);
      setRecords(payload.records);
      setSummary(payload.summary);
    } catch (extractError) {
      setError(
        extractError instanceof Error
          ? extractError.message
          : "No se pudieron extraer numeros.",
      );
    } finally {
      setIsExtracting(null);
    }
  }

  async function copyNumbers() {
    const text = records.map((record) => record.number).join("\n");

    if (!text) {
      return;
    }

    await navigator.clipboard.writeText(text);
    setCopyMessage(`${records.length} numeros copiados.`);
  }

  if (isLoadingInstances) {
    return <Card>Cargando instancias...</Card>;
  }

  return (
    <div className="space-y-6">
      <Card className="border-amber-300/30 bg-amber-300/10">
        <p className="font-semibold text-amber-100">
          Advertencia de privacidad y consentimiento
        </p>
        <p className="mt-2 text-sm leading-6 text-foreground-muted">
          Extraer numeros desde chats o contactos puede implicar tratamiento de
          datos personales. WA Sender no agregara estos numeros automaticamente a
          campanas, no los marcara como opt-in y exigira confirmacion explicita
          antes de cualquier uso comercial.
        </p>
        <label className="mt-4 flex items-start gap-3 text-sm text-foreground">
          <input
            checked={privacyConfirmed}
            className="mt-1"
            type="checkbox"
            onChange={(event) => setPrivacyConfirmed(event.target.checked)}
          />
          Confirmo que tengo base legal o autorizacion para consultar esta
          informacion y entiendo que el consentimiento queda como desconocido.
        </label>
      </Card>

      <Card className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          <SelectField
            label="Instancia WhatsApp"
            value={selectedInstanceId}
            options={selectableInstances.map((instance) => ({
              label: `${instance.name} - ${instance.status}`,
              value: instance.id,
            }))}
            hint={
              activeInstances.length > 0
                ? "Se priorizan instancias activas."
                : "No hay instancias activas; en mock puedes probar igualmente."
            }
            onChange={(event) => setSelectedInstanceId(event.target.value)}
          />
          <Button
            disabled={!selectedInstanceId || !privacyConfirmed || Boolean(isExtracting)}
            onClick={() => void extract("contacts")}
          >
            {isExtracting === "contacts" ? "Extrayendo..." : "Extraer contactos"}
          </Button>
          <Button
            disabled={!selectedInstanceId || !privacyConfirmed || Boolean(isExtracting)}
            variant="secondary"
            onClick={() => void extract("chats")}
          >
            {isExtracting === "chats" ? "Extrayendo..." : "Extraer chats"}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-background-panel px-4 py-3 text-sm">
            <input
              checked={omitGroups}
              type="checkbox"
              onChange={(event) => setOmitGroups(event.target.checked)}
            />
            Omitir grupos
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-background-panel px-4 py-3 text-sm">
            <input
              checked={omitMissingPhones}
              type="checkbox"
              onChange={(event) => setOmitMissingPhones(event.target.checked)}
            />
            Omitir sin telefono
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-background-panel px-4 py-3 text-sm">
            <input
              checked={dedupe}
              type="checkbox"
              onChange={(event) => setDedupe(event.target.checked)}
            />
            Quitar duplicados
          </label>
        </div>

        {error ? (
          <p className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-orange-100">
            {error}
          </p>
        ) : null}
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-foreground-muted">
            Registros
          </p>
          <p className="mt-3 text-3xl font-semibold">{records.length}</p>
          <p className="mt-2 text-sm text-foreground-muted">
            Consentimiento: desconocido
          </p>
        </Card>
        <Card>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-foreground-muted">
            Fuente
          </p>
          <p className="mt-3 text-3xl font-semibold">
            {records[0]?.source ?? "-"}
          </p>
          <p className="mt-2 text-sm text-foreground-muted">
            Raw: {summary?.raw ?? 0}
          </p>
        </Card>
        <Card>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-foreground-muted">
            Modo
          </p>
          <p className="mt-3 text-3xl font-semibold">
            {summary?.mocked ? "Mock" : summary ? "Real" : "-"}
          </p>
          <p className="mt-2 text-sm text-foreground-muted">
            No se crean campanas automaticamente.
          </p>
        </Card>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Resultados</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Columnas exportables: number, display_name, source, is_saved,
              last_seen_or_updated_at.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button disabled={records.length === 0} variant="secondary" onClick={() => void copyNumbers()}>
              Copiar numeros
            </Button>
            <Button
              disabled={records.length === 0}
              variant="secondary"
              onClick={() => downloadCsv(exportRows, exportColumns, "wa-sender-numeros.csv")}
            >
              Descargar CSV
            </Button>
            <Button
              disabled={records.length === 0}
              onClick={() => downloadXlsx(exportRows, exportColumns, "wa-sender-numeros.xlsx")}
            >
              Descargar XLSX
            </Button>
          </div>
        </div>

        {copyMessage ? (
          <p className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
            {copyMessage}
          </p>
        ) : null}

        {records.length === 0 ? (
          <EmptyState
            title="Sin numeros extraidos"
            description="Confirma la advertencia, selecciona una instancia y extrae desde contactos o chats."
            helper="Los resultados quedan con consentimiento desconocido por defecto."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.18em] text-foreground-muted">
                <tr>
                  <th className="border-b border-border px-3 py-3">Telefono</th>
                  <th className="border-b border-border px-3 py-3">Nombre</th>
                  <th className="border-b border-border px-3 py-3">Fuente</th>
                  <th className="border-b border-border px-3 py-3">Guardado</th>
                  <th className="border-b border-border px-3 py-3">Ultima actividad</th>
                  <th className="border-b border-border px-3 py-3">Consentimiento</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={`${record.source}-${record.number}`}>
                    <td className="border-b border-border/60 px-3 py-3 font-mono">
                      {record.number}
                    </td>
                    <td className="border-b border-border/60 px-3 py-3">
                      {record.displayName ?? "-"}
                    </td>
                    <td className="border-b border-border/60 px-3 py-3">
                      {record.source}
                    </td>
                    <td className="border-b border-border/60 px-3 py-3">
                      {record.isSaved ? "Si" : "No"}
                    </td>
                    <td className="border-b border-border/60 px-3 py-3">
                      {record.lastSeenOrUpdatedAt
                        ? new Date(record.lastSeenOrUpdatedAt).toLocaleString("es-PE")
                        : "-"}
                    </td>
                    <td className="border-b border-border/60 px-3 py-3">
                      <span className="rounded-full border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-muted">
                        unknown
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
