import { mockAgents } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function AgentsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Agent library"
        title="Agentes guardados"
        description="Listado mock de agentes creados, su estado y el provider asociado."
        actions={<Button>Nuevo agente</Button>}
      />

      <section className="grid gap-4 xl:grid-cols-3">
        {mockAgents.map((agent) => (
          <Card key={agent.name} className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold tracking-tight">{agent.name}</h2>
                <p className="text-sm text-foreground-muted">{agent.provider}</p>
              </div>
              <span className="rounded-full border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                {agent.status}
              </span>
            </div>
            <p className="text-sm leading-6 text-foreground-muted">{agent.summary}</p>
            <div className="flex gap-3">
              <Button className="flex-1" variant="secondary">
                Versiones
              </Button>
              <Button className="flex-1">Activar</Button>
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
