import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SelectField } from "@/components/ui/select-field";
import { TextAreaField } from "@/components/ui/text-area-field";

export default function AgentPlaygroundPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Playground"
        title="Prueba conversacional"
        description="Interfaz tipo telefono para testear prompts y providers mock antes de activar un agente."
        actions={<Button>Enviar mensaje</Button>}
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-4">
          <SelectField
            label="Agente"
            options={[
              { label: "Asesor inmobiliario", value: "asesor" },
              { label: "Recepcion clinica", value: "recepcion" },
            ]}
          />
          <TextAreaField
            label="Mensaje del operador"
            placeholder="Quiero validar como responde ante una objecion de precio."
            hint="El endpoint real se conectara a LLMProvider cuando el modulo de agentes quede listo."
          />
        </Card>

        <Card className="flex min-h-[520px] flex-col rounded-[36px] p-3">
          <div className="mx-auto mb-4 h-1.5 w-20 rounded-full bg-white/10" />
          <div className="flex-1 rounded-[28px] bg-background p-5">
            <div className="flex h-full flex-col justify-end gap-4">
              <div className="max-w-[80%] rounded-[24px] rounded-bl-md bg-background-panel px-4 py-3 text-sm leading-6 text-foreground-muted">
                Hola, soy tu asistente mock. Este espacio simulara conversaciones reales y
                respuestas generadas por provider adapter.
              </div>
              <div className="ml-auto max-w-[80%] rounded-[24px] rounded-br-md bg-accent px-4 py-3 text-sm leading-6 text-slate-950">
                Necesito una respuesta mas consultiva para leads que aun no agendan.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
