import { AgentPlaygroundClient } from "@/components/agents/agent-playground-client";
import { PageHeader } from "@/components/ui/page-header";

export default function AgentPlaygroundPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Playground"
        title="Prueba conversacional"
        description="Interfaz tipo telefono para probar la version activa del agente con provider mock o LLM real desde backend."
      />

      <AgentPlaygroundClient />
    </div>
  );
}
