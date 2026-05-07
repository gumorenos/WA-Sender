export const mockStats = [
  {
    title: "Conexiones activas",
    value: "3",
    change: "+1 esta semana",
    tone: "accent" as const,
  },
  {
    title: "Agentes creados",
    value: "7",
    change: "2 listos para pruebas",
    tone: "neutral" as const,
  },
  {
    title: "Campanas activas",
    value: "4",
    change: "1 pausada",
    tone: "warm" as const,
  },
  {
    title: "Actividad reciente",
    value: "28",
    change: "eventos ultimas 24h",
    tone: "neutral" as const,
  },
];

export const mockInstances = [
  { name: "Ventas Norte", provider: "Evolution Mock", status: "Activo", sessions: "2 chats sincronizados" },
  { name: "Soporte 01", provider: "Evolution Mock", status: "Conectando", sessions: "QR renovado hace 2 min" },
  { name: "Prospeccion", provider: "Evolution Mock", status: "Desconectado", sessions: "Sin vincular" },
];

export const mockCampaignRows = [
  { label: "Pendientes", value: "248" },
  { label: "Enviados", value: "1,024" },
  { label: "Fallidos", value: "14" },
  { label: "Delay actual", value: "45 s" },
];

export const mockAgents = [
  { name: "Asesor inmobiliario", status: "Activo", provider: "Mock LLM", summary: "Cierre consultivo para leads tibios." },
  { name: "Recepcion clinica", status: "Borrador", provider: "Mock LLM", summary: "Filtra citas, sintomas y horarios." },
  { name: "Soporte retail", status: "Inactivo", provider: "Mock LLM", summary: "Resuelve FAQ y escala incidencias." },
];

export const mockActivity = [
  "Campana Abril VIP pausada por ventana horaria.",
  "Instancia Ventas Norte actualizo QR hace 9 min.",
  "Agente Asesor inmobiliario publico version 3.",
  "Exportacion de numeros preparada para descarga CSV.",
];
