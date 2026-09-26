export type ProviderConfig = {
  openAiApiKey: string;
  twilioAccountSid: string;
  twilioApiKeySid: string;
  twilioApiKeySecret: string;
  twilioMessagingServiceSid: string;
  sendGridApiKey: string;
  sendGridFromEmail: string;
};

export function integrationReadiness(config: ProviderConfig) {
  return {
    openAi: Boolean(config.openAiApiKey.trim()),
    twilioSms: Boolean(
      config.twilioAccountSid.trim() &&
      config.twilioApiKeySid.trim() &&
      config.twilioApiKeySecret.trim() &&
      config.twilioMessagingServiceSid.trim()
    ),
    sendGridEmail: Boolean(config.sendGridApiKey.trim() && config.sendGridFromEmail.trim()),
  };
}
