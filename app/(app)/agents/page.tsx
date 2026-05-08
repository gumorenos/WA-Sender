import Link from "next/link";

import { AgentInstanceAssignmentsClient } from "@/components/agents/agent-instance-assignments-client";
import { AgentsListClient } from "@/components/agents/agents-list-client";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export default function AgentsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Agent library"
        title="Agentes guardados"
        description="Lista de agentes creados, version activa, source y estado operativo dentro de tu workspace."
        actions={
          <Link href="/agents/create">
            <Button>Nuevo agente</Button>
          </Link>
        }
      />

      <AgentInstanceAssignmentsClient />
      <AgentsListClient />
    </div>
  );
}
