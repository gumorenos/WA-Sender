import { describe, expect, it } from "vitest";

import { parseEvolutionWebhookPayload } from "./webhook-parser";

describe("parseEvolutionWebhookPayload", () => {
  it("parses an inbound Evolution messages.upsert payload", () => {
    const parsed = parseEvolutionWebhookPayload({
      instance: "ws_demo_sales",
      data: {
        key: {
          remoteJid: "51999888777@s.whatsapp.net",
          fromMe: false,
          id: "ABC123",
        },
        pushName: "Cliente Peru",
        message: {
          conversation: "Hola, quiero precios",
        },
      },
    });

    expect(parsed).toMatchObject({
      providerInstanceId: "ws_demo_sales",
      phone: "+51999888777",
      text: "Hola, quiero precios",
      fromMe: false,
      isGroup: false,
      pushName: "Cliente Peru",
      providerMessageId: "ABC123",
    });
  });

  it("minimizes opt-out free text to the durable suppression signal", () => {
    const parsed = parseEvolutionWebhookPayload({
      instance: "ws_demo_sales",
      data: {
        key: {
          remoteJid: "51999888777@s.whatsapp.net",
          fromMe: false,
          id: "OPTOUT123",
        },
        message: {
          conversation:
            "STOP por favor. Mi correo privado es persona@example.com y no quiero mas mensajes.",
        },
      },
    });

    expect(parsed?.text).toBe("STOP");
    expect(parsed?.text).not.toContain("persona@example.com");
  });

  it("marks outbound messages as fromMe", () => {
    const parsed = parseEvolutionWebhookPayload({
      instanceName: "ws_demo_sales",
      data: {
        key: {
          remoteJid: "51999888777@s.whatsapp.net",
          fromMe: true,
        },
        message: {
          conversation: "Respuesta enviada",
        },
      },
    });

    expect(parsed?.fromMe).toBe(true);
  });

  it("marks group chats so the webhook can ignore them", () => {
    const parsed = parseEvolutionWebhookPayload({
      instance: "ws_demo_sales",
      data: {
        key: {
          remoteJid: "120363000000000000@g.us",
          fromMe: false,
        },
        message: {
          extendedTextMessage: {
            text: "Mensaje de grupo",
          },
        },
      },
    });

    expect(parsed?.isGroup).toBe(true);
  });
});
