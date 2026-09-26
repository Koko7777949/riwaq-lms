import { describe, expect, it } from "vitest";
import { integrationReadiness, type ProviderConfig } from "./integrationConfig";

const emptyConfig: ProviderConfig = {
  openAiApiKey: "",
  twilioAccountSid: "",
  twilioApiKeySid: "",
  twilioApiKeySecret: "",
  twilioMessagingServiceSid: "",
  sendGridApiKey: "",
  sendGridFromEmail: "",
};

describe("server-side integration credential readiness", () => {
  it("keeps all providers disabled when the user has not configured credentials", () => {
    expect(integrationReadiness(emptyConfig)).toEqual({
      openAi: false,
      twilioSms: false,
      sendGridEmail: false,
    });
  });

  it("enables each provider only when all of that provider's required settings exist", () => {
    expect(integrationReadiness({
      ...emptyConfig,
      openAiApiKey: "test-openai-key",
      twilioAccountSid: "AC-test",
      twilioApiKeySid: "SK-test",
      twilioApiKeySecret: "test-secret",
      twilioMessagingServiceSid: "MG-test",
      sendGridApiKey: "test-sendgrid-key",
      sendGridFromEmail: "hello@example.com",
    })).toEqual({ openAi: true, twilioSms: true, sendGridEmail: true });
  });

  it("rejects incomplete Twilio and SendGrid configuration instead of sending partially configured requests", () => {
    expect(integrationReadiness({ ...emptyConfig, twilioAccountSid: "AC-test" }).twilioSms).toBe(false);
    expect(integrationReadiness({ ...emptyConfig, sendGridApiKey: "test-key" }).sendGridEmail).toBe(false);
  });
});
