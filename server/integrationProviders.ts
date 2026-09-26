import { buildLessonAssistantMessages, type AssistantTurn, type CourseContext } from "./integrationsLogic";

export type LessonChatTurn = AssistantTurn;

type Fetcher = typeof fetch;

export type OpenAIConfig = { apiKey: string };
export type SendGridConfig = { apiKey: string; fromEmail: string };
export type TwilioConfig = {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  messagingServiceSid: string;
};

const jsonHeaders = (apiKey: string) => ({
  "content-type": "application/json",
  authorization: `Bearer ${apiKey}`,
});

export async function requestOpenAIAnswer(
  config: OpenAIConfig,
  course: CourseContext,
  turns: LessonChatTurn[],
  fetcher: Fetcher = fetch,
): Promise<string> {
  const response = await fetcher("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: jsonHeaders(config.apiKey),
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      store: false,
      max_output_tokens: 450,
      input: buildLessonAssistantMessages(course, turns),
    }),
    signal: AbortSignal.timeout(20_000),
    redirect: "error",
  });

  if (!response.ok) throw new Error("OpenAI request failed");
  const data = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const text =
    data.output_text ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      .filter((part) => part.type === "output_text")
      .map((part) => part.text ?? "")
      .join("");
  if (!text?.trim()) throw new Error("OpenAI returned no answer");
  return text.trim().slice(0, 4000);
}

export async function sendSendGridTestEmail(
  config: SendGridConfig,
  toEmail: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const response = await fetcher("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: jsonHeaders(config.apiKey),
    body: JSON.stringify({
      personalizations: [{ to: [{ email: toEmail }] }],
      from: { email: config.fromEmail },
      subject: "رسالة تجريبية من رِواق",
      content: [
        {
          type: "text/plain",
          value: "هذه رسالة تحقق طلبتها من إعدادات رِواق. لن نرسل تحديثات أخرى ما لم تُبقِ موافقتك مفعّلة.",
        },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("SendGrid email request failed");
}

export async function sendTwilioTestSms(
  config: TwilioConfig,
  toPhone: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`;
  const auth = Buffer.from(`${config.apiKeySid}:${config.apiKeySecret}`).toString("base64");
  const body = new URLSearchParams({
    To: toPhone,
    MessagingServiceSid: config.messagingServiceSid,
    Body: "هذه رسالة تحقق من رِواق أرسلتها بطلبك. أوقف رسائل SMS من إعدادات التنبيهات.",
  });
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Twilio SMS request failed");
}
