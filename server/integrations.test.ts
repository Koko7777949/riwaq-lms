import { describe, expect, it } from "vitest";
import {
  assistantCourses,
  buildLessonAssistantMessages,
  dailyRequestCount,
  emailTestBlockReason,
  isValidE164Phone,
  isWithinCooldown,
  smsTestBlockReason,
} from "./integrationsLogic";
import {
  requestOpenAIAnswer,
  sendSendGridTestEmail,
  sendTwilioTestSms,
} from "./integrationProviders";

function mockResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("integration policy helpers", () => {
  it("accepts E.164 numbers and rejects local, short, or malformed numbers", () => {
    expect(isValidE164Phone("+966501234567")).toBe(true);
    expect(isValidE164Phone("+12025550123")).toBe(true);
    expect(isValidE164Phone("0501234567")).toBe(false);
    expect(isValidE164Phone("+0123456789")).toBe(false);
    expect(isValidE164Phone("+12 34567890")).toBe(false);
  });

  it("blocks SMS unless explicit consent and a valid destination exist", () => {
    expect(smsTestBlockReason({ smsOptIn: false, phoneNumber: "+966501234567" })).toBe("opt_in_required");
    expect(smsTestBlockReason({ smsOptIn: true, phoneNumber: null })).toBe("phone_required");
    expect(smsTestBlockReason({ smsOptIn: true, phoneNumber: "0501234567" })).toBe("phone_required");
    expect(smsTestBlockReason({ smsOptIn: true, phoneNumber: "+966501234567" })).toBe(null);
  });

  it("blocks email tests unless the user opted in and has an account address", () => {
    expect(emailTestBlockReason({ emailNotifications: false, email: "student@example.com" })).toBe("opt_in_required");
    expect(emailTestBlockReason({ emailNotifications: true, email: null })).toBe("email_required");
    expect(emailTestBlockReason({ emailNotifications: true, email: "student@example.com" })).toBe(null);
  });

  it("enforces cooldowns and resets daily request counts across UTC dates", () => {
    const now = new Date("2026-09-25T10:00:30.000Z");
    expect(isWithinCooldown(new Date("2026-09-25T10:00:00.000Z"), now, 60_000)).toBe(true);
    expect(isWithinCooldown(new Date("2026-09-25T09:58:00.000Z"), now, 60_000)).toBe(false);
    expect(dailyRequestCount("2026-09-25", 19, "2026-09-25")).toBe(19);
    expect(dailyRequestCount("2026-09-24", 20, "2026-09-25")).toBe(0);
  });

  it("builds an Arabic-scoped prompt that discloses absent lesson text", () => {
    const messages = buildLessonAssistantMessages(assistantCourses[1], [
      { role: "user", content: "اشرح لي تجربة المستخدم" },
    ]);
    expect(messages[0]?.content).toContain("لا تدّعِ أنك قرأت الدرس");
    expect(messages[0]?.content).toContain(assistantCourses[1].title);
    expect(messages[1]?.content).toBe("اشرح لي تجربة المستخدم");
  });
});

describe("server-only provider adapters", () => {
  it("sends a bounded OpenAI request with storage disabled and returns answer text", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return mockResponse(200, { output_text: "إجابة تعليمية واضحة." });
    }) as typeof fetch;

    const answer = await requestOpenAIAnswer(
      { apiKey: "server-only-test-key" },
      assistantCourses[2],
      [{ role: "user", content: "كيف أقرأ ملف CSV؟" }],
      fetcher,
    );

    expect(answer).toBe("إجابة تعليمية واضحة.");
    expect(sentBody).toMatchObject({ model: "gpt-4.1-mini", store: false, max_output_tokens: 450 });
    expect(JSON.stringify(sentBody)).not.toContain("server-only-test-key");
  });

  it("sends email only to the supplied account address with the verified sender", async () => {
    let sentBody: Record<string, any> | undefined;
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body)) as Record<string, any>;
      return new Response(null, { status: 202 });
    }) as typeof fetch;

    await sendSendGridTestEmail(
      { apiKey: "sendgrid-secret", fromEmail: "hello@riwaq.example" },
      "student@example.com",
      fetcher,
    );

    expect(sentBody?.personalizations[0].to[0].email).toBe("student@example.com");
    expect(sentBody?.from.email).toBe("hello@riwaq.example");
    expect(sentBody?.subject).toContain("رِواق");
  });

  it("uses Twilio's server-side API-key auth and an E.164 target through a messaging service", async () => {
    let requestUrl = "";
    let authorization = "";
    let sentForm = new URLSearchParams();
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      sentForm = new URLSearchParams(String(init?.body));
      return mockResponse(201, { status: "queued" });
    }) as typeof fetch;

    await sendTwilioTestSms({
      accountSid: "AC123456789",
      apiKeySid: "SK123456789",
      apiKeySecret: "twilio-secret",
      messagingServiceSid: "MG123456789",
    }, "+966501234567", fetcher);

    expect(requestUrl).toContain("Accounts/AC123456789/Messages.json");
    expect(authorization).toBe(`Basic ${Buffer.from("SK123456789:twilio-secret").toString("base64")}`);
    expect(sentForm.get("To")).toBe("+966501234567");
    expect(sentForm.get("MessagingServiceSid")).toBe("MG123456789");
  });

  it("does not expose provider response bodies when a send fails", async () => {
    const fetcher = (async () => mockResponse(400, { error: "private provider response" })) as typeof fetch;
    await expect(requestOpenAIAnswer(
      { apiKey: "server-only-test-key" },
      assistantCourses[1],
      [{ role: "user", content: "سؤال تجريبي" }],
      fetcher,
    )).rejects.toThrow("OpenAI request failed");
  });
});
