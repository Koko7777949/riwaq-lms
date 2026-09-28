import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  CreditCard,
  GraduationCap,
  LoaderCircle,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Wallet,
  XCircle,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";

type DashboardTab = "courses" | "payments";
type PaymentStatus = "paid" | "pending" | "expired" | "failed";

const formatAmount = (minor: number, currency: string) => new Intl.NumberFormat("ar-SA", {
  style: "currency",
  currency: currency.toUpperCase(),
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(minor / 100);

const formatDate = (date: Date | null) => date
  ? new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "long", day: "numeric" }).format(date)
  : "—";

const paymentStatus = (status: PaymentStatus) => {
  if (status === "paid") return { label: "مكتملة", className: "student-status paid", icon: <CheckCircle2 size={15} /> };
  if (status === "pending") return { label: "بانتظار تأكيد الدفع", className: "student-status pending", icon: <Clock3 size={15} /> };
  if (status === "expired") return { label: "لم تكتمل", className: "student-status expired", icon: <XCircle size={15} /> };
  return { label: "تعذّر الدفع", className: "student-status failed", icon: <XCircle size={15} /> };
};

const coursePalette = ["lavender", "mint", "peach", "blue", "lime", "rose"];
const courseMark = ["✳", "⌘", "↗", "◉", "↗", "✳"];

function StudentBrand({ onClick }: { onClick: () => void }) {
  return <button className="brand" onClick={onClick} aria-label="العودة إلى رِواق">
    <span className="brand-mark"><span /></span>
    <span className="brand-name">رِواق<span className="brand-dot">.</span><small>منصّة تعلّم</small></span>
  </button>;
}

export default function StudentDashboard() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const dashboard = trpc.billing.studentDashboard.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: true,
  });
  const readiness = trpc.billing.readiness.useQuery();
  const [tab, setTab] = useState<DashboardTab>("courses");

  const purchasedCourses = dashboard.data?.courses ?? [];
  const payments = dashboard.data?.payments ?? [];
  const totalPaidMinor = useMemo(
    () => payments.reduce((total, payment) => total + (payment.status === "paid" ? payment.amountMinor : 0), 0),
    [payments],
  );
  const pendingCount = payments.filter((payment) => payment.status === "pending").length;
  const firstName = user?.name?.trim().split(/\s+/)[0] || "بك";

  return <div className="student-dashboard-shell" dir="rtl">
    <header className="topbar student-topbar">
      <div className="topbar-start">
        <StudentBrand onClick={() => setLocation("/")} />
        <nav className="student-top-nav" aria-label="التنقل الرئيسي">
          <button onClick={() => setLocation("/")}>استكشف الدورات</button>
          <span className="active">لوحة الطالب</span>
        </nav>
      </div>
      <div className="student-topbar-end">
        {user && <span className="student-user-chip"><span>{firstName.slice(0, 1)}</span>{user.name || user.email}</span>}
        {!authLoading && isAuthenticated && <button className="student-home-link" onClick={() => setLocation("/")}>الرئيسية <ArrowLeft size={15} /></button>}
      </div>
    </header>

    <main className="student-dashboard-main">
      <div className="student-page-topline">
        <div className="page-breadcrumb"><button onClick={() => setLocation("/")}>رِواق</button><span aria-hidden="true">/</span><span>لوحة الطالب</span></div>
        {readiness.data?.mode === "test" && <span className="student-test-pill"><ShieldCheck size={14} /> مدفوعات وضع الاختبار</span>}
      </div>

      <section className="student-welcome">
        <div>
          <span className="section-kicker"><GraduationCap size={15} /> مساحتك للتعلّم</span>
          <h1>مرحباً، <em>{firstName}.</em></h1>
          <p>تابع دوراتك، وراجع سجلّ مشترياتك في مكان واحد.</p>
        </div>
        <div className="student-welcome-mark" aria-hidden="true"><BookOpen size={28} /><span>رِواق</span></div>
      </section>

      {!authLoading && !isAuthenticated ? <section className="student-login-card">
        <span className="student-login-icon"><GraduationCap size={22} /></span>
        <div><h2>سجّل الدخول لعرض مسارك</h2><p>ستظهر هنا الدورات التي اشتريتها وسجلّ المدفوعات المرتبط بحسابك فقط.</p></div>
        <button className="button-dark" onClick={() => startLogin()}><LogIn size={16} /> تسجيل الدخول</button>
      </section> : authLoading ? <section className="student-loading" role="status"><LoaderCircle size={22} className="student-spin" /> جارٍ التحقق من حسابك…</section> : <>
        {readiness.data?.mode === "test" && <div className="student-test-note"><ShieldCheck size={16} /><span><b>بيئة اختبار Stripe.</b> السجلات هنا للتجربة ولا تمثل تحصيلاً لمدفوعات حقيقية.</span></div>}

        <section className="student-metrics" aria-label="ملخص حسابك">
          <article className="student-metric-card">
            <span className="student-metric-icon green"><BookOpen size={18} /></span>
            <div><small>دورات متاحة لك</small><b>{dashboard.isLoading ? "—" : purchasedCourses.length.toLocaleString("ar-SA")}</b></div>
          </article>
          <article className="student-metric-card">
            <span className="student-metric-icon sand"><Wallet size={18} /></span>
            <div><small>إجمالي المدفوعات المكتملة</small><b>{dashboard.isLoading ? "—" : formatAmount(totalPaidMinor, "sar")}</b></div>
          </article>
          <article className="student-metric-card">
            <span className="student-metric-icon blue"><CreditCard size={18} /></span>
            <div><small>عمليات بانتظار التأكيد</small><b>{dashboard.isLoading ? "—" : pendingCount.toLocaleString("ar-SA")}</b></div>
          </article>
        </section>

        <section className="student-content-card">
          <div className="student-card-heading">
            <div><span className="section-kicker">حسابك التعليمي</span><h2>مكتبتك <em>وسجلّك.</em></h2></div>
            <button className="student-refresh" onClick={() => void dashboard.refetch()} disabled={dashboard.isFetching} aria-label="تحديث السجل"><RefreshCw size={15} className={dashboard.isFetching ? "student-spin" : ""} /> تحديث</button>
          </div>
          <div className="student-tabs" role="tablist" aria-label="محتوى لوحة الطالب">
            <button role="tab" aria-selected={tab === "courses"} className={tab === "courses" ? "active" : ""} onClick={() => setTab("courses")}><BookOpen size={16} /> دوراتي <span>{purchasedCourses.length.toLocaleString("ar-SA")}</span></button>
            <button role="tab" aria-selected={tab === "payments"} className={tab === "payments" ? "active" : ""} onClick={() => setTab("payments")}><CreditCard size={16} /> سجل المدفوعات <span>{payments.length.toLocaleString("ar-SA")}</span></button>
          </div>

          {dashboard.isLoading ? <div className="student-loading student-panel-loading" role="status"><LoaderCircle size={20} className="student-spin" /> جارٍ تحميل بياناتك…</div> : dashboard.isError ? <div className="student-empty" role="alert"><span className="student-empty-icon"><CreditCard size={21} /></span><b>تعذّر تحميل السجل الآن</b><p>لم يتم تغيير مشترياتك. حاول تحديث الصفحة بعد قليل.</p><button className="student-secondary-button" onClick={() => void dashboard.refetch()}><RefreshCw size={14} /> إعادة المحاولة</button></div> : tab === "courses" ? <div className="student-course-list" role="tabpanel">
            {purchasedCourses.length ? purchasedCourses.map((course) => <article className="student-course-row" key={course.courseId}>
              <div className={`student-course-art ${coursePalette[(course.courseId - 1) % coursePalette.length]}`}><span>{courseMark[(course.courseId - 1) % courseMark.length]}</span><i><BookOpen size={15} /></i></div>
              <div className="student-course-details"><div className="student-course-heading"><div><span className="student-course-instructor">{course.instructor}</span><h3>{course.title}</h3></div><span className="student-access-pill"><CheckCircle2 size={14} /> وصول دائم</span></div>
                <div className="student-course-meta"><span><CreditCard size={14} /> {formatAmount(course.amountMinor, course.currency)}</span><span><Clock3 size={14} /> اشتريت في {formatDate(course.purchasedAt)}</span><button onClick={() => setLocation("/?view=learning")}>تابع التعلّم <ArrowLeft size={14} /></button></div>
              </div>
            </article>) : <div className="student-empty"><span className="student-empty-icon"><BookOpen size={21} /></span><b>مكتبتك بانتظار أول دورة</b><p>استكشف الدورات العملية وأضف ما يناسب أهدافك إلى مسارك.</p><button className="button-dark" onClick={() => setLocation("/")}>اكتشف الدورات <ArrowLeft size={15} /></button></div>}
          </div> : <div className="student-payment-list" role="tabpanel">
            {payments.length ? <div className="student-table-wrap"><table className="student-payment-table"><thead><tr><th scope="col">الدورة</th><th scope="col">التاريخ</th><th scope="col">المبلغ</th><th scope="col">الحالة</th></tr></thead><tbody>{payments.map((payment, index) => {
              const state = paymentStatus(payment.status as PaymentStatus);
              return <tr key={`${payment.courseId}-${index}`}><td><div className="student-payment-course"><span>{courseMark[(payment.courseId - 1) % courseMark.length]}</span><div><b>{payment.courseTitle}</b><small>{payment.instructor}</small></div></div></td><td>{formatDate(payment.paidAt ?? payment.createdAt)}</td><td className="student-payment-amount">{formatAmount(payment.amountMinor, payment.currency)}</td><td><span className={state.className}>{state.icon}{state.label}</span></td></tr>;
            })}</tbody></table></div> : <div className="student-empty"><span className="student-empty-icon"><CreditCard size={21} /></span><b>لا توجد مدفوعات مسجّلة</b><p>ستظهر مشترياتك هنا بعد بدء عملية الدفع.</p><button className="button-dark" onClick={() => setLocation("/")}>تصفّح الدورات <ArrowLeft size={15} /></button></div>}
          </div>}
        </section>
        <div className="student-privacy-note"><ShieldCheck size={15} /><span>هذا السجل خاص بحسابك. لا نعرض معلومات الدفع الحساسة أو روابط جلسات Stripe.</span></div>
      </>}
    </main>
    <footer className="student-footer"><StudentBrand onClick={() => setLocation("/")} /><span>تعلّم يُشبهك. معرفة تبقى معك.</span><span>© رِواق ٢٠٢٦</span></footer>
  </div>;
}
