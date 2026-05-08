"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectField } from "@/components/ui/select-field";
import { TextAreaField } from "@/components/ui/text-area-field";
import { cn } from "@/lib/utils";

type AgentStatus = "DRAFT" | "ACTIVE" | "INACTIVE";

type PlaygroundAgent = {
  id: string;
  name: string;
  status: AgentStatus;
  llmProvider: string;
  modelName: string | null;
  activeVersion: {
    versionNumber: number;
    tokenEstimate: number;
    promptExcerpt: string;
  } | null;
};

type PlaygroundMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  provider?: string;
  model?: string;
};

function statusLabel(status: AgentStatus) {
  return status === "ACTIVE"
    ? "Activo"
    : status === "INACTIVE"
      ? "Inactivo"
      : "Borrador";
}

function MessageBubble({ message }: { message: PlaygroundMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "max-w-[84%] whitespace-pre-wrap rounded-[24px] px-4 py-3 text-sm leading-6 shadow-sm",
        isUser
          ? "ml-auto rounded-br-md bg-accent text-slate-950"
          : "rounded-bl-md bg-background-panel text-foreground",
      )}
    >
      <p>{message.content}</p>
      {!isUser && (message.provider || message.model) ? (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
          {[message.provider, message.model].filter(Boolean).join(" / ")}
        </p>
      ) : null}
    </div>
  );
}

export function AgentPlaygroundClient() {
  const [agents, setAgents] = useState<PlaygroundAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PlaygroundMessage[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  useEffect(() => {
    async function loadAgents() {
      setIsLoadingAgents(true);
      setError(null);

      try {
        const response = await fetch("/api/agents", { cache: "no-store" });
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.error ?? "No se pudieron cargar los agentes.");
        }

        const loadedAgents = (json.agents ?? []) as PlaygroundAgent[];
        setAgents(loadedAgents);
        setSelectedAgentId((current) => current || loadedAgents[0]?.id || "");
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron cargar los agentes.",
        );
      } finally {
        setIsLoadingAgents(false);
      }
    }

    loadAgents();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function resetChat() {
    setSessionId(null);
    setMessages([]);
    setMessage("");
    setError(null);
  }

  function handleAgentChange(agentId: string) {
    setSelectedAgentId(agentId);
    setSessionId(null);
    setMessages([]);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = message.trim();

    if (!trimmed || !selectedAgentId || isSending) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch("/api/agents/playground", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId: selectedAgentId,
          sessionId,
          message: trimmed,
        }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "No se pudo generar la respuesta.");
      }

      setSessionId(json.sessionId);
      setMessages(json.messages ?? []);
      setMessage("");
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "No se pudo generar la respuesta.",
      );
    } finally {
      setIsSending(false);
    }
  }

  if (isLoadingAgents) {
    return <Card>Cargando agentes...</Card>;
  }

  if (agents.length === 0) {
    return (
      <EmptyState
        title="Todavia no hay agentes para probar"
        description="Crea un agente manual o con builder antes de abrir el playground."
        helper={
          <Link
            className="text-accent underline-offset-4 hover:underline"
            href="/agents/create"
          >
            Crear agente
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Card className="space-y-5">
        <SelectField
          label="Agente"
          value={selectedAgentId}
          options={agents.map((agent) => ({
            label: `${agent.name} - ${statusLabel(agent.status)}`,
            value: agent.id,
          }))}
          onChange={(event) => handleAgentChange(event.target.value)}
          hint="La conversacion usa la version activa del prompt y se ejecuta server-side."
        />

        {selectedAgent ? (
          <div className="rounded-3xl border border-border bg-background-soft p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                v{selectedAgent.activeVersion?.versionNumber ?? 0}
              </span>
              <span className="rounded-full border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground-muted">
                {selectedAgent.llmProvider}
              </span>
              <span className="rounded-full border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground-muted">
                {selectedAgent.modelName || "modelo por env"}
              </span>
            </div>
            <p className="mt-4 line-clamp-5 text-sm leading-6 text-foreground-muted">
              {selectedAgent.activeVersion?.promptExcerpt ??
                "Este agente todavia no tiene prompt activo."}
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-3xl border border-danger/30 bg-danger/10 p-4 text-sm leading-6 text-orange-100">
            {error}
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <TextAreaField
            label="Mensaje de prueba"
            value={message}
            maxLength={1200}
            placeholder="Hola, quiero saber precios y horarios."
            hint={`${message.length}/1200 caracteres. No se envia ninguna clave LLM al navegador.`}
            onChange={(event) => setMessage(event.target.value)}
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button disabled={!message.trim() || !selectedAgentId || isSending} type="submit">
              {isSending ? "Generando..." : "Enviar mensaje"}
            </Button>
            <Button
              disabled={isSending && messages.length === 0}
              type="button"
              variant="secondary"
              onClick={resetChat}
            >
              Reiniciar chat
            </Button>
          </div>
        </form>
      </Card>

      <Card className="flex min-h-[620px] flex-col rounded-[36px] p-3">
        <div className="mx-auto mb-4 h-1.5 w-20 rounded-full bg-white/10" />
        <div className="flex flex-1 flex-col overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.12),_transparent_34%),#0d1412]">
          <div className="border-b border-white/10 bg-black/20 px-5 py-4">
            <p className="text-sm font-semibold text-foreground">
              {selectedAgent?.name ?? "Agente"}
            </p>
            <p className="text-xs text-foreground-muted">
              Playground seguro con historial de sesion
            </p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center">
                <div className="max-w-xs rounded-3xl border border-border bg-background-panel/80 p-5">
                  <p className="font-semibold text-foreground">Chat listo</p>
                  <p className="mt-2 text-sm leading-6 text-foreground-muted">
                    Escribe un mensaje para probar el system prompt activo. En
                    desarrollo usa `LLM_PROVIDER=mock`.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((chatMessage) => (
                <MessageBubble key={chatMessage.id} message={chatMessage} />
              ))
            )}
            <div ref={endRef} />
          </div>
        </div>
      </Card>
    </div>
  );
}
