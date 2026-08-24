"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

const HANDOFF_STATUS = "HUMAN_HANDOFF";

type Role = "OWNER" | "ADMIN" | "MEMBER";

type ReplyReview = {
  id: string;
  content: string;
  providerMessageId: string | null;
  createdAt: string;
};

type Conversation = {
  id: string;
  instanceId: string;
  instanceName: string;
  agentId: string | null;
  agentName: string | null;
  contactPhone: string;
  contactDisplayName: string | null;
  status: string;
  lastMessageAt: string | null;
  updatedAt: string;
  lastMessage: {
    direction: string;
    content: string;
    createdAt: string;
  } | null;
  replyReview: ReplyReview | null;
};

type Agent = {
  id: string;
  name: string;
  settings: {
    handoffKeywords: unknown;
  } | null;
};

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Sin mensajes";
}

function excerpt(value: string, maxLength = 120) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "La operacion no pudo completarse.");
  }

  return body;
}

export function ConversationsOpsClient() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [role, setRole] = useState<Role>("MEMBER");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [savingKeywords, setSavingKeywords] = useState(false);

  const canMutate = role === "OWNER" || role === "ADMIN";
  const handoffCount = useMemo(
    () => conversations.filter((item) => item.status === HANDOFF_STATUS).length,
    [conversations],
  );
  const unknownReplyCount = useMemo(
    () => conversations.filter((item) => item.replyReview).length,
    [conversations],
  );

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [conversationsResponse, meResponse, agentsResponse] = await Promise.all([
        fetch("/api/conversations", { cache: "no-store" }),
        fetch("/api/me", { cache: "no-store" }),
        fetch("/api/agents", { cache: "no-store" }),
      ]);

      const conversationsPayload = await readJson<{ conversations: Conversation[] }>(
        conversationsResponse,
      );
      const mePayload = await readJson<{ membership: { role: Role } }>(meResponse);
      const agentsPayload = await readJson<{ agents: Agent[] }>(agentsResponse);

      setConversations(conversationsPayload.conversations);
      setRole(mePayload.membership.role);
      setAgents(agentsPayload.agents);

      const nextAgentId =
        selectedAgentId && agentsPayload.agents.some((agent) => agent.id === selectedAgentId)
          ? selectedAgentId
          : agentsPayload.agents[0]?.id ?? "";
      setSelectedAgentId(nextAgentId);

      const selected = agentsPayload.agents.find((agent) => agent.id === nextAgentId);
      setKeywordsText(
        Array.isArray(selected?.settings?.handoffKeywords)
          ? selected.settings.handoffKeywords
              .filter((value): value is string => typeof value === "string")
              .join("\n")
          : "",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar handoff.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const selected = agents.find((agent) => agent.id === selectedAgentId);
    setKeywordsText(
      Array.isArray(selected?.settings?.handoffKeywords)
        ? selected.settings.handoffKeywords
            .filter((value): value is string => typeof value === "string")
            .join("\n")
        : "",
    );
  }, [agents, selectedAgentId]);

  async function changeHandoff(conversation: Conversation, active: boolean) {
    if (!canMutate || busyId) {
      return;
    }

    const reason = window.prompt(
      active
        ? "Motivo del handoff humano (obligatorio):"
        : "Motivo para devolver el control al agente (obligatorio):",
      active ? "Operador toma la conversacion" : "Atencion humana finalizada",
    );

    if (!reason?.trim()) {
      return;
    }

    const confirmed = window.confirm(
      active
        ? "Confirmar handoff: el agente dejara de responder automaticamente a esta conversacion."
        : "Confirmar reanudacion: el agente podra responder al proximo inbound si todos sus kill switches lo permiten.",
    );

    if (!confirmed) {
      return;
    }

    setBusyId(conversation.id);
    setError(null);

    try {
      await readJson(
        await fetch(`/api/conversations/${conversation.id}/handoff`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            active,
            confirmed: true,
            reason: reason.trim(),
          }),
        }),
      );
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cambiar el handoff.");
    } finally {
      setBusyId(null);
    }
  }

  async function reconcileReply(
    conversation: Conversation,
    resolution: "CONFIRMED_SENT" | "CONFIRMED_NOT_SENT",
  ) {
    if (!canMutate || !conversation.replyReview || busyId) {
      return;
    }

    const reason = window.prompt(
      resolution === "CONFIRMED_SENT"
        ? "Evidencia o motivo para confirmar que el mensaje SI fue enviado (obligatorio):"
        : "Evidencia o motivo para confirmar que el mensaje NO fue enviado (obligatorio):",
    );

    if (!reason?.trim()) {
      return;
    }

    let providerMessageId: string | undefined;
    if (resolution === "CONFIRMED_SENT") {
      const providerId = window.prompt(
        "ID del mensaje en Evolution/WhatsApp si lo tienes (opcional):",
        conversation.replyReview.providerMessageId ?? "",
      );
      providerMessageId = providerId?.trim() || undefined;
    }

    const confirmed = window.confirm(
      resolution === "CONFIRMED_SENT"
        ? "Confirmar como ENVIADO. Esta accion no llamara Evolution; solo cerrara el resultado incierto con tu evidencia."
        : "Confirmar como NO ENVIADO. Esta accion no reenviara el mensaje antiguo; solo desbloqueara futuros inbounds para una nueva respuesta.",
    );

    if (!confirmed) {
      return;
    }

    setBusyId(conversation.id);
    setError(null);

    try {
      await readJson(
        await fetch(
          `/api/conversations/${conversation.id}/replies/${conversation.replyReview.id}/reconcile`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              confirmed: true,
              resolution,
              reason: reason.trim(),
              ...(providerMessageId ? { providerMessageId } : {}),
            }),
          },
        ),
      );
      await loadData();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo reconciliar el auto-reply.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function saveKeywords() {
    if (!canMutate || !selectedAgentId || savingKeywords) {
      return;
    }

    const keywords = keywordsText
      .split(/\r?\n|,/)
      .map((value) => value.trim())
      .filter(Boolean);

    setSavingKeywords(true);
    setError(null);

    try {
      await readJson(
        await fetch(`/api/agents/${selectedAgentId}/handoff-settings`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keywords }),
        }),
      );
      await loadData();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudieron guardar las keywords.",
      );
    } finally {
      setSavingKeywords(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Human handoff"
        title="Conversaciones y derivacion humana"
        description="Controla cuando el agente debe detenerse y un operador humano toma la conversacion. Los resultados de envio inciertos quedan bloqueados hasta reconciliacion explicita."
        actions={
          <Button onClick={() => void loadData()} variant="secondary">
            Actualizar
          </Button>
        }
      />

      {error ? <Card className="border-rose-300/30 text-rose-100">{error}</Card> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <p className="text-sm text-foreground-muted">Conversaciones visibles</p>
          <p className="mt-2 text-3xl font-semibold">{conversations.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-foreground-muted">En handoff humano</p>
          <p className="mt-2 text-3xl font-semibold">{handoffCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-foreground-muted">Replies por revisar</p>
          <p className="mt-2 text-3xl font-semibold">{canMutate ? unknownReplyCount : "—"}</p>
        </Card>
        <Card>
          <p className="text-sm text-foreground-muted">Permiso actual</p>
          <p className="mt-2 text-xl font-semibold">{role}</p>
          <p className="mt-1 text-xs text-foreground-muted">
            {canMutate ? "Puedes operar handoff y reconciliacion." : "Acceso de solo lectura."}
          </p>
        </Card>
      </section>

      <Card className="space-y-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
            Keywords por agente
          </p>
          <h2 className="mt-2 text-xl font-semibold">Derivacion automatica a humano</h2>
          <p className="mt-2 text-sm leading-6 text-foreground-muted">
            Una coincidencia detiene el auto-reply antes de llamar al LLM. Una keyword por linea o separada por coma; maximo 20.
          </p>
        </div>

        {agents.length ? (
          <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_auto] lg:items-end">
            <label className="space-y-2 text-sm">
              <span className="text-foreground-muted">Agente</span>
              <select
                className="w-full rounded-2xl border border-border bg-background-panel px-4 py-3 text-foreground"
                disabled={!canMutate}
                onChange={(event) => setSelectedAgentId(event.target.value)}
                value={selectedAgentId}
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <span className="text-foreground-muted">Keywords</span>
              <textarea
                className="min-h-28 w-full rounded-2xl border border-border bg-background-panel px-4 py-3 text-foreground disabled:opacity-60"
                disabled={!canMutate}
                onChange={(event) => setKeywordsText(event.target.value)}
                placeholder={"asesor humano\nhablar con alguien\nquiero un operador"}
                value={keywordsText}
              />
            </label>

            <Button disabled={!canMutate || savingKeywords} onClick={() => void saveKeywords()}>
              {savingKeywords ? "Guardando..." : "Guardar keywords"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-foreground-muted">No hay agentes configurados.</p>
        )}
      </Card>

      {loading ? <Card className="text-foreground-muted">Cargando conversaciones...</Card> : null}

      {!loading && conversations.length === 0 ? (
        <EmptyState
          title="Aun no hay conversaciones"
          description="Las conversaciones apareceran aqui cuando llegue un webhook inbound reconocido."
          helper="El handoff no habilita envio real ni cambia los kill switches globales."
        />
      ) : null}

      {!loading && conversations.length > 0 ? (
        <div className="grid gap-4">
          {conversations.map((conversation) => {
            const inHandoff = conversation.status === HANDOFF_STATUS;
            return (
              <Card key={conversation.id} className="space-y-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-semibold">
                        {conversation.contactDisplayName ?? conversation.contactPhone}
                      </h3>
                      <span
                        className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${
                          inHandoff
                            ? "border-amber-300/40 text-amber-200"
                            : "border-emerald-300/30 text-emerald-200"
                        }`}
                      >
                        {inHandoff ? "Handoff humano" : conversation.status}
                      </span>
                      {conversation.replyReview ? (
                        <span className="rounded-full border border-rose-300/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-rose-200">
                          Envio incierto
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-foreground-muted">
                      {conversation.contactPhone} · {conversation.instanceName} · Agente: {conversation.agentName ?? "Sin asignar"}
                    </p>
                  </div>

                  {canMutate ? (
                    <Button
                      disabled={busyId === conversation.id}
                      onClick={() => void changeHandoff(conversation, !inHandoff)}
                      variant={inHandoff ? "secondary" : "primary"}
                    >
                      {busyId === conversation.id
                        ? "Actualizando..."
                        : inHandoff
                          ? "Reanudar agente"
                          : "Tomar como humano"}
                    </Button>
                  ) : null}
                </div>

                {conversation.replyReview ? (
                  <div className="space-y-3 rounded-2xl border border-rose-300/30 bg-background-panel px-4 py-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-rose-200">
                        Resultado de proveedor incierto · {formatDateTime(conversation.replyReview.createdAt)}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-foreground">
                        {excerpt(conversation.replyReview.content, 300)}
                      </p>
                      <p className="mt-2 text-xs text-foreground-muted">
                        Provider ID conocido: {conversation.replyReview.providerMessageId ?? "No disponible"}
                      </p>
                    </div>
                    <p className="text-xs leading-5 text-foreground-muted">
                      Revisa evidencia externa antes de decidir. Ninguna de estas acciones llama Evolution ni reenvia este texto.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        disabled={busyId === conversation.id}
                        onClick={() => void reconcileReply(conversation, "CONFIRMED_SENT")}
                        variant="secondary"
                      >
                        Confirmar enviado
                      </Button>
                      <Button
                        disabled={busyId === conversation.id}
                        onClick={() => void reconcileReply(conversation, "CONFIRMED_NOT_SENT")}
                        variant="secondary"
                      >
                        Confirmar no enviado
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-border bg-background-panel px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-foreground-muted">
                    Ultimo mensaje real · {formatDateTime(conversation.lastMessageAt)}
                  </p>
                  <p className="mt-2 text-sm text-foreground">
                    {conversation.lastMessage
                      ? excerpt(conversation.lastMessage.content)
                      : "Sin contenido registrado."}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
