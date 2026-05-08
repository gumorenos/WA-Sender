import { ExtractNumbersClient } from "@/components/utilities/extract-numbers-client";
import { PageHeader } from "@/components/ui/page-header";

export default function ExtractNumbersPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Utilities"
        title="Extraer numeros"
        description="Extrae numeros desde contactos o chats de una instancia, con advertencias de privacidad, consentimiento desconocido y export seguro."
      />

      <ExtractNumbersClient />
    </div>
  );
}
