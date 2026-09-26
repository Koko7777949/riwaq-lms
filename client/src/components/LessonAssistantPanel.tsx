import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ShieldCheck, Sparkles } from "lucide-react";

export function LessonAssistantPanel({ courseId, title }: { courseId: number; title: string }) {
  const { isAuthenticated, loading } = useAuth();
  const availability = trpc.integrations.availability.useQuery(undefined, { retry: false });
  const [messages, setMessages] = useState<Message[]>([]);

  const assistant = trpc.integrations.askAboutCourse.useMutation({
    onSuccess: ({ answer }) => setMessages((current) => [...current, { role: "assistant", content: answer }]),
    onError: (error) => {
      toast.error(error.message);
      setMessages((current) => [...current, { role: "assistant", content: "لم أتمكن من إكمال الإجابة هذه المرة. يمكنك المحاولة بعد قليل." }]);
    },
  });

  const send = (content: string) => {
    if (!isAuthenticated) {
      startLogin();
      return;
    }
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    const turns = next
      .filter((turn): turn is Message & { role: "user" | "assistant" } => turn.role === "user" || turn.role === "assistant")
      .slice(-10)
      .map(({ role, content: text }) => ({ role, content: text }));
    assistant.mutate({ courseId, turns });
  };

  return <section className="assistant-panel" dir="rtl" aria-label={`مساعد دورة ${title}`}>
    <div className="assistant-heading">
      <span className="assistant-mark"><Sparkles size={17}/></span>
      <div><h3>اسأل مساعد الدرس</h3><p>{title}</p></div>
      <span className="assistant-private"><ShieldCheck size={14}/>خاص بحسابك</span>
    </div>
    {loading || availability.isLoading ? <div className="integration-loading">جار التحقق من توفر المساعد…</div> : !isAuthenticated ? <div className="assistant-signin"><p>سجّل الدخول لاستخدام المساعد والحفاظ على محادثتك داخل جلستك.</p><button type="button" className="button-dark" onClick={() => startLogin()}>تسجيل الدخول</button></div> : !availability.data?.openAi ? <div className="assistant-config">المساعد غير مفعّل بعد. أضف OPENAI_API_KEY ضمن أسرار المشروع لتفعيل الإجابات. لا تُرسل أي سؤال إلى مزوّد خارجي حتى يكتمل الإعداد.</div> : <AIChatBox
      messages={messages}
      onSendMessage={send}
      isLoading={assistant.isPending}
      placeholder="اكتب سؤالك عن موضوع الدورة…"
      height={380}
      className="assistant-chat"
      emptyStateMessage="ابدأ بسؤال مرتبط بموضوع الدورة."
      suggestedPrompts={["اشرح لي المفهوم الأساسي ببساطة", "أعطني مثالاً عملياً", "ما الخطوة التالية التي تنصحني بها؟"]}
    />}
    <p className="assistant-disclosure">المساعد لا يرى نصوص الدروس الفعلية في النسخة الحالية؛ يجيب عن موضوع الدورة ولا يختلق محتوى أو اقتباسات. الحدّ التجريبي: ٢٠ سؤالاً يومياً.</p>
  </section>;
}
