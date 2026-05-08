import { AgentBuilderForm } from "@/components/agents/agent-builder-form";
import { PageHeader } from "@/components/ui/page-header";

export default function BuilderAgentCreatePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Builder mode"
        title="Crear agente con Builder"
        description="Recorre cinco pasos para generar instrucciones completas y el JSON de configuracion sin depender de un LLM."
      />

      <AgentBuilderForm />
    </div>
  );
}
