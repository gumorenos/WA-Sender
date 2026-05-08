import { CampaignSendClient } from "@/components/campaigns/campaign-send-client";
import { PageHeader } from "@/components/ui/page-header";

export default function CampaignSendPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Launch"
        title="Programar y enviar"
        description="Inicia, pausa, reanuda o detiene campanas con delay, horario activo, zona horaria y controles de consentimiento."
      />

      <CampaignSendClient />
    </div>
  );
}
