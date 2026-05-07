import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SelectField } from "@/components/ui/select-field";
import { SectionBlock } from "@/components/marketing/section-block";

export default function CampaignSendPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Launch"
        title="Programar y enviar"
        description="Pantalla para revisar fecha de inicio, ventana horaria y delay antes de poner una campana en cola."
        actions={<Button>Iniciar campana</Button>}
      />

      <SectionBlock
        title="Parametros operativos"
        description="La capa visual ya separa decisiones de scheduling y confirmacion. El worker real y BullMQ se conectaran despues."
        aside={
          <>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
              Guardrails
            </p>
            <ul className="space-y-3 text-sm leading-6 text-foreground-muted">
              <li>Delay minimo obligatorio.</li>
              <li>Confirmacion antes de envio real.</li>
              <li>Sin autoenvio a numeros extraidos.</li>
            </ul>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <SelectField
            label="Campana"
            options={[{ label: "Abril VIP - mock", value: "abril-vip" }]}
          />
          <SelectField
            label="Fecha de inicio"
            options={[{ label: "Hoy, 18:00", value: "today-18" }]}
          />
          <SelectField
            label="Delay"
            options={[
              { label: "30 segundos", value: "30" },
              { label: "45 segundos", value: "45" },
              { label: "60 segundos", value: "60" },
            ]}
          />
        </div>
      </SectionBlock>

      <EmptyState
        title="Envio real bloqueado hasta integrar auth, DB y worker"
        description="La experiencia visual ya deja claro que el operador debe revisar scheduling, limites y consentimiento antes de cualquier ejecucion real."
        actionLabel="Guardar configuracion"
        helper="La activacion final dependera de BullMQ, Redis y provider WhatsApp."
      />
    </div>
  );
}
