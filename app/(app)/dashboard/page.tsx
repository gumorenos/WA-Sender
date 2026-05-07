import { mockActivity, mockStats } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Control room"
        title="Dashboard operativo"
        description="Vista ejecutiva del workspace con foco en conexiones, campanas y agentes. Los indicadores usan mock data mientras auth y base de datos se conectan."
        actions={
          <>
            <Button variant="secondary">Revisar alertas</Button>
            <Button>Crear campana</Button>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {mockStats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                Actividad reciente
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Cola de eventos del operador
              </h2>
            </div>
            <Button variant="ghost">Ver todo</Button>
          </div>
          <div className="space-y-3">
            {mockActivity.map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-border bg-background-panel px-4 py-4 text-sm text-foreground-muted"
              >
                {item}
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
            Checklist MVP
          </p>
          <div className="space-y-4">
            {[
              "Auth.js y Google OAuth pendientes de conexion.",
              "Workspace demo todavia no persistido.",
              "Evolution API en modo mock o placeholder visual.",
              "BullMQ y DB aun sin integracion real.",
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-border px-4 py-4 text-sm text-foreground-muted">
                {item}
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
