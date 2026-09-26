import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Bell, Check, Loader2, Mail, MessageSquareText, X } from "lucide-react";

export function IntegrationSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const availability = trpc.integrations.availability.useQuery(undefined, { enabled: open, retry: false });
  const settings = trpc.integrations.settings.useQuery(undefined, { enabled: open && isAuthenticated, retry: false });
  const utils = trpc.useUtils();
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");

  useEffect(() => {
    if (!settings.data) return;
    setEmailNotifications(settings.data.emailNotifications);
    setSmsOptIn(settings.data.smsOptIn);
    setPhoneNumber(settings.data.phoneNumber);
  }, [settings.data]);

  const save = trpc.integrations.saveSettings.useMutation({
    onSuccess: async () => {
      toast.success("حُفظت تفضيلاتك");
      await utils.integrations.settings.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const emailTest = trpc.integrations.sendTestEmail.useMutation({
    onSuccess: () => toast.success("أُرسلت رسالة التحقق إلى بريد حسابك"),
    onError: (error) => toast.error(error.message),
  });
  const smsTest = trpc.integrations.sendTestSms.useMutation({
    onSuccess: () => toast.success("أُرسلت رسالة التحقق إلى رقمك"),
    onError: (error) => toast.error(error.message),
  });

  if (!open) return null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isAuthenticated) {
      startLogin();
      return;
    }
    save.mutate({ emailNotifications, phoneNumber: phoneNumber.trim() || null, smsOptIn });
  };

  return <div className="modal-backdrop integration-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="integration-dialog" role="dialog" aria-modal="true" aria-labelledby="integration-settings-title" dir="rtl">
      <button className="modal-close" onClick={onClose} aria-label="إغلاق"><X size={19}/></button>
      <span className="section-kicker"><Bell size={14}/>تفضيلاتك محفوظة لحسابك</span>
      <h2 id="integration-settings-title">إعدادات <em>التنبيهات.</em></h2>
      <p className="integration-intro">اختر القنوات التي تريدها. لن تُرسل أي رسالة تلقائياً من هذه الشاشة؛ أزرار التحقق ترسل رسالة واحدة لك عند الضغط عليها.</p>
      {authLoading ? <div className="integration-loading"><Loader2 className="spin" size={20}/>جار التحقق من حسابك…</div> : !isAuthenticated ? <div className="integration-signin"><p>سجّل الدخول لربط رقمك واختيار تفضيلات الإشعارات.</p><button type="button" className="button-dark" onClick={() => startLogin()}>تسجيل الدخول</button></div> : settings.isLoading ? <div className="integration-loading"><Loader2 className="spin" size={20}/>تحميل إعدادات حسابك…</div> : settings.error ? <div className="integration-error">تعذّر تحميل إعدادات الإشعارات. أعد المحاولة لاحقاً.</div> : <form onSubmit={onSubmit}>
        <label className="integration-toggle">
          <span className="integration-toggle-icon"><Mail size={17}/></span>
          <span className="integration-toggle-copy"><b>رسائل البريد</b><small>{settings.data?.email || "لا يوجد بريد محفوظ في حسابك"}</small></span>
          <input type="checkbox" checked={emailNotifications} onChange={(event) => setEmailNotifications(event.target.checked)} aria-label="السماح برسائل البريد"/>
        </label>
        <button className="integration-test" type="button" disabled={!emailNotifications || !settings.data?.email || !availability.data?.sendGridEmail || emailTest.isPending} onClick={() => emailTest.mutate()}>
          {emailTest.isPending ? <Loader2 className="spin" size={15}/> : <Mail size={15}/>} أرسل لي رسالة تحقق بالبريد
        </button>
        {availability.data && !availability.data.sendGridEmail && <div className="integration-unconfigured">البريد غير مهيّأ بعد: أضف مفتاح SendGrid وعنوان From موثّقاً في أسرار المشروع.</div>}
        <div className="integration-divider"/>
        <label className="integration-field">رقم الهاتف بصيغة دولية<input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="+9665XXXXXXXX" inputMode="tel" autoComplete="tel" maxLength={16}/><small>مثال: ‎+966501234567</small></label>
        <label className="integration-toggle sms-toggle">
          <span className="integration-toggle-icon sms-icon"><MessageSquareText size={17}/></span>
          <span className="integration-toggle-copy"><b>أوافق على رسائل SMS</b><small>موافقة صريحة؛ يمكنك إيقافها هنا في أي وقت. لا رسائل تسويقية.</small></span>
          <input type="checkbox" checked={smsOptIn} onChange={(event) => setSmsOptIn(event.target.checked)} aria-label="الموافقة على الرسائل النصية القصيرة"/>
        </label>
        <button className="integration-test" type="button" disabled={!smsOptIn || !/^\+[1-9]\d{7,14}$/.test(phoneNumber.trim()) || !availability.data?.twilioSms || smsTest.isPending} onClick={() => smsTest.mutate()}>
          {smsTest.isPending ? <Loader2 className="spin" size={15}/> : <MessageSquareText size={15}/>} أرسل لي رسالة تحقق SMS
        </button>
        {availability.data && !availability.data.twilioSms && <div className="integration-unconfigured">SMS غير مهيّأ بعد: أضف بيانات Twilio وMessaging Service في أسرار المشروع.</div>}
        <div className="integration-privacy"><Check size={15}/>لا نسجل نصوص رسائل التحقق. رقمك يُستخدم فقط لإرسال SMS التي وافقت عليها.</div>
        <div className="integration-actions"><button type="button" className="cancel-button" onClick={onClose}>إلغاء</button><button type="submit" className="button-dark" disabled={save.isPending}>{save.isPending ? <Loader2 className="spin" size={15}/> : <Check size={15}/>} حفظ التفضيلات</button></div>
      </form>}
    </section>
  </div>;
}
