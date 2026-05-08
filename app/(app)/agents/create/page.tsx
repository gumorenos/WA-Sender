import Link from "next/link";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

const linkClass =
  "group block rounded-[28px] border border-border bg-background-panel/70 p-6 transition hover:border-accent/50 hover:bg-background-soft/60";

export default function AgentCreatePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Agent builder"
        title="Crear agente"
        description="Elige si quieres redactar instrucciones completas manualmente o construir el prompt en cinco pasos guiados."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Link className={linkClass} href="/agents/create/builder">
          <Card className="space-y-4 border-0 bg-transparent p-0 shadow-none">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
              Builder
            </p>
            <h2 className="text-2xl font-semibold tracking-tight">
              Crear agente con Builder
            </h2>
            <p className="text-sm leading-6 text-foreground-muted">
              Completa identidad, alcance, audiencia y tono. El sistema genera
              un prompt deterministico y un JSON versionable.
            </p>
          </Card>
        </Link>

        <Link className={linkClass} href="/agents/create/manual">
          <Card className="space-y-4 border-0 bg-transparent p-0 shadow-none">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
              Manual
            </p>
            <h2 className="text-2xl font-semibold tracking-tight">
              Crear agente manualmente
            </h2>
            <p className="text-sm leading-6 text-foreground-muted">
              Escribe instrucciones completas si ya tienes el comportamiento del
              asistente definido y solo necesitas versionarlo.
            </p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
