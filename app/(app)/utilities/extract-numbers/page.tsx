import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SelectField } from "@/components/ui/select-field";

export default function ExtractNumbersPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Utilities"
        title="Extraer numeros"
        description="Vista preparada para listar contactos o chats extraidos desde una instancia conectada, siempre con advertencias de privacidad y consentimiento."
        actions={<Button variant="secondary">Descargar CSV</Button>}
      />

      <Card className="space-y-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <SelectField
            label="Instancia origen"
            options={[
              { label: "Ventas Norte (mock)", value: "ventas-norte" },
              { label: "Soporte 01 (mock)", value: "soporte-01" },
            ]}
            hint="El provider real definira si la fuente es contactos, chats o ambos."
          />
          <div className="flex items-end">
            <Button className="w-full md:w-auto">Extraer en modo mock</Button>
          </div>
        </div>
      </Card>

      <EmptyState
        title="No reutilizar automaticamente esta audiencia"
        description="La UI ya fija el guardrail principal: un numero extraido no debe terminar en una campana sin confirmacion y opt-in. El backend reforzara esa regla."
        actionLabel="Copiar muestra"
        helper="Cuando se conecte el provider, cada registro incluira origen, fecha y estado de opt-in."
      />
    </div>
  );
}
