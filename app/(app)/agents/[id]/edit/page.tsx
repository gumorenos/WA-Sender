import { AgentAutoReplyControl } from "@/components/agents/agent-auto-reply-control";
import { AgentEditClient } from "@/components/agents/agent-edit-client";
import { PageHeader } from "@/components/ui/page-header";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AgentEditPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Agent editor"
        title="Editar agente"
        description="Actualiza instrucciones o configuracion del builder. Cada guardado publica una nueva version del prompt."
      />

      <AgentAutoReplyControl agentId={id} />
      <AgentEditClient agentId={id} />
    </div>
  );
}
