import { AgentManualForm } from "@/components/agents/agent-manual-form";
import { PageHeader } from "@/components/ui/page-header";

export default function ManualAgentCreatePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Manual mode"
        title="Crear agente manual"
        description="Define nombre e instrucciones completas. El backend crea el prompt final de forma deterministica y versionable."
      />

      <AgentManualForm />
    </div>
  );
}
