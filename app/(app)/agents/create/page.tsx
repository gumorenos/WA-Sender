import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SelectField } from "@/components/ui/select-field";
import { TextAreaField } from "@/components/ui/text-area-field";
import { SectionBlock } from "@/components/marketing/section-block";

export default function AgentCreatePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Agent builder"
        title="Crear agente"
        description="Base visual del builder guiado para identidad, alcance, audiencia, tono y revision final. Sin conexion a providers todavia."
        actions={<Button>Generar prompt</Button>}
      />

      <SectionBlock
        title="Paso 1 y 2"
        description="Definicion inicial del agente y del tipo de respuestas permitidas."
        aside={
          <>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
              Salida esperada
            </p>
            <p className="text-sm leading-6 text-foreground-muted">
              System prompt consolidado y JSON de configuracion versionable.
            </p>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField
            label="Provider preferido"
            options={[
              { label: "Mock LLM", value: "mock" },
              { label: "DeepSeek", value: "deepseek" },
              { label: "OpenAI", value: "openai" },
            ]}
          />
          <SelectField
            label="Tono base"
            options={[
              { label: "Consultivo", value: "consultivo" },
              { label: "Directo", value: "directo" },
              { label: "Calido", value: "calido" },
            ]}
          />
        </div>
        <TextAreaField
          label="Identidad del agente"
          placeholder="Asesor comercial enfocado en convertir leads de alto valor..."
        />
        <TextAreaField
          label="Que puede responder"
          placeholder="Solo responde preguntas de producto, precios, agenda y proximos pasos..."
        />
      </SectionBlock>
    </div>
  );
}
