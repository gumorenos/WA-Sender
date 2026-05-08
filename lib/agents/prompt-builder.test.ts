import { describe, expect, it } from "vitest";

import { buildBuilderPrompt, buildManualPrompt, estimateTokenCount } from "./prompt-builder";

describe("buildManualPrompt", () => {
  it("wraps manual instructions in a deterministic system prompt", () => {
    const result = buildManualPrompt({
      source: "MANUAL",
      name: "Asesor Clinico",
      instructions:
        "Responde solo sobre horarios, especialidades y como reservar una cita.",
      llmProvider: "MOCK",
      modelName: "",
    });

    expect(result.prompt).toContain("Eres Asesor Clinico");
    expect(result.prompt).toContain("Responde solo sobre horarios");
    expect(result.config.source).toBe("manual");
  });
});

describe("buildBuilderPrompt", () => {
  it("builds a prompt with authorized topics and audience context", () => {
    const result = buildBuilderPrompt({
      source: "BUILDER",
      llmProvider: "MOCK",
      modelName: "",
      identity: {
        category: "salud",
        assistantName: "Recepcion Salud",
        businessName: "Clinica Central",
        website: "https://clinica.example",
        facebook: "",
        instagram: "@clinicacentral",
        address: "Av. Principal 123",
        businessHours: "Lun a Vie 9:00 a 18:00",
        otherCategory: "",
        objective: "Ayudar a concretar citas y resolver preguntas frecuentes.",
      },
      capabilities: {
        servicios: { enabled: true, notes: "Consultas medicas y chequeos." },
        precios: { enabled: true, notes: "" },
        horarios: { enabled: true, notes: "" },
        ubicacion: { enabled: true, notes: "" },
        promociones: { enabled: false, notes: "" },
        reservas: { enabled: true, notes: "Explicar como reservar por WhatsApp." },
        mediosPago: { enabled: false, notes: "" },
        cancelacion: { enabled: false, notes: "" },
        cuotas: { enabled: false, notes: "" },
        otro: { enabled: false, notes: "" },
      },
      audience: {
        customerType: "Pacientes nuevos y recurrentes",
        ageRange: "25 a 60 anos",
        technicalLevel: "Bajo",
        region: "Peru",
      },
      tone: {
        formal: true,
        professional: true,
        technical: false,
        brief: true,
        close: true,
        sales: false,
        empathetic: true,
        conversational: true,
        useEmojis: false,
        shortAnswers: true,
      },
    });

    expect(result.prompt).toContain("Recepcion Salud");
    expect(result.prompt).toContain("Clinica Central");
    expect(result.prompt).toContain("servicios: Consultas medicas y chequeos.");
    expect(result.prompt).toContain("Tipo de cliente: Pacientes nuevos y recurrentes");
    expect(result.config.source).toBe("builder");
    expect(result.config.identity).toBeTruthy();
  });
});

describe("estimateTokenCount", () => {
  it("returns a stable token approximation", () => {
    expect(estimateTokenCount("12345678")).toBe(2);
  });
});
