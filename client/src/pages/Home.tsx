import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  Award,
  Bell,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  CreditCard,
  Download,
  Eye,
  FileText,
  Filter,
  GraduationCap,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

type Course = {
  id: number;
  title: string;
  instructor: string;
  category: string;
  level: string;
  lessons: number;
  hours: number;
  rating: string;
  students: string;
  price: number;
  color: string;
  icon: string;
  tag?: string;
  progress?: number;
};

type View = "discover" | "learning" | "instructor" | "ledger";

type FinanceTab = "balances" | "allocations" | "payouts" | "refunds";

const initialCourses: Course[] = [
  { id: 1, title: "أساسيات التصميم وتجربة المستخدم", instructor: "سارة العتيبي", category: "التصميم", level: "مبتدئ", lessons: 28, hours: 6.5, rating: "4.9", students: "٢٬٤٨٠", price: 189, color: "lavender", icon: "✳", tag: "الأكثر طلباً", progress: 72 },
  { id: 2, title: "تحليل البيانات باستخدام بايثون", instructor: "عمر الشمري", category: "البرمجة", level: "متوسط", lessons: 36, hours: 9, rating: "4.8", students: "١٬٨٣٠", price: 229, color: "mint", icon: "⌘", tag: "جديد", progress: 38 },
  { id: 3, title: "التسويق الرقمي من الصفر للاحتراف", instructor: "ليان الحربي", category: "الأعمال", level: "مبتدئ", lessons: 22, hours: 5, rating: "4.9", students: "٣٬١٢٠", price: 159, color: "peach", icon: "↗", progress: 0 },
  { id: 4, title: "تصوير المنتجات بالجوال", instructor: "فيصل الدوسري", category: "التصوير", level: "مبتدئ", lessons: 18, hours: 4, rating: "4.7", students: "٩٦٠", price: 139, color: "blue", icon: "◉", progress: 0 },
  { id: 5, title: "إطلاق مشروعك التجاري الأول", instructor: "نورة القحطاني", category: "الأعمال", level: "متوسط", lessons: 31, hours: 7, rating: "4.9", students: "١٬٤٤٠", price: 199, color: "lime", icon: "↗", progress: 0 },
  { id: 6, title: "الهوية البصرية وبناء العلامة", instructor: "سارة العتيبي", category: "التصميم", level: "متقدم", lessons: 25, hours: 5.5, rating: "4.8", students: "٨٨٠", price: 179, color: "rose", icon: "✳", progress: 0 },
];

const categories = ["الكل", "التصميم", "البرمجة", "الأعمال", "التصوير", "تطوير الذات"];
const money = (n: number) => `${n.toLocaleString("ar-SA")} ر.س`;

const transactions = [
  { id: "AL-28491", instructor: "سارة العتيبي", course: "أساسيات التصميم وتجربة المستخدم", gross: 189, fee: 19, share: 170, earned: 113, state: "يُكتسب تدريجياً", date: "٢٥ سبتمبر ٢٠٢٦", hue: "violet" },
  { id: "AL-28490", instructor: "عمر الشمري", course: "تحليل البيانات باستخدام بايثون", gross: 229, fee: 23, share: 206, earned: 137, state: "يُكتسب تدريجياً", date: "٢٥ سبتمبر ٢٠٢٦", hue: "green" },
  { id: "AL-28489", instructor: "ليان الحربي", course: "التسويق الرقمي من الصفر للاحتراف", gross: 159, fee: 16, share: 143, earned: 143, state: "مكتمل الاكتساب", date: "٢٤ سبتمبر ٢٠٢٦", hue: "orange" },
  { id: "AL-28488", instructor: "فيصل الدوسري", course: "تصوير المنتجات بالجوال", gross: 139, fee: 14, share: 125, earned: 58, state: "يُكتسب تدريجياً", date: "٢٤ سبتمبر ٢٠٢٦", hue: "blue" },
  { id: "AL-28487", instructor: "نورة القحطاني", course: "إطلاق مشروعك التجاري الأول", gross: 199, fee: 20, share: 179, earned: 179, state: "مكتمل الاكتساب", date: "٢٣ سبتمبر ٢٠٢٦", hue: "rose" },
];

const instructors = [
  { name: "سارة العتيبي", email: "sara@riwaq.academy", earned: 24840, paid: 11200, reserved: 0, available: 13640, last: "ناجحة · ١٨ سبتمبر", initials: "سع", tone: "violet" },
  { name: "عمر الشمري", email: "omar@riwaq.academy", earned: 19560, paid: 8500, reserved: 0, available: 11060, last: "ناجحة · ١٧ سبتمبر", initials: "عش", tone: "green" },
  { name: "ليان الحربي", email: "layan@riwaq.academy", earned: 17430, paid: 10200, reserved: 0, available: 7230, last: "ناجحة · ١٥ سبتمبر", initials: "لح", tone: "orange" },
  { name: "فيصل الدوسري", email: "faisal@riwaq.academy", earned: 12890, paid: 6800, reserved: 900, available: 5190, last: "قيد التحقق · ٢٤ سبتمبر", initials: "فد", tone: "blue" },
  { name: "نورة القحطاني", email: "noura@riwaq.academy", earned: 11840, paid: 6200, reserved: 0, available: 5640, last: "ناجحة · ١٢ سبتمبر", initials: "نق", tone: "rose" },
];

const payouts = [
  { id: "PO-00824", name: "فيصل الدوسري", amount: 900, status: "قيد التحقق", ref: "•••• 2408", date: "٢٤ سبتمبر ٢٠٢٦", color: "amber" },
  { id: "PO-00823", name: "سارة العتيبي", amount: 2400, status: "ناجحة", ref: "•••• 8193", date: "١٨ سبتمبر ٢٠٢٦", color: "green" },
  { id: "PO-00822", name: "عمر الشمري", amount: 1800, status: "ناجحة", ref: "•••• 4621", date: "١٧ سبتمبر ٢٠٢٦", color: "green" },
  { id: "PO-00821", name: "ليان الحربي", amount: 2100, status: "ناجحة", ref: "•••• 1204", date: "١٥ سبتمبر ٢٠٢٦", color: "green" },
  { id: "PO-00820", name: "سارة العتيبي", amount: 1650, status: "فشلت · أُعيد الرصيد", ref: "—", date: "١٢ سبتمبر ٢٠٢٦", color: "red" },
];

function Brand({ onClick }: { onClick: () => void }) {
  return <button className="brand" onClick={onClick} aria-label="العودة للرئيسية"><span className="brand-mark"><span /></span><span className="brand-name">رِواق<span className="brand-dot">.</span><small>منصّة تعلّم</small></span></button>;
}

function CourseCard({ course, onOpen, onEnroll, enrolled, checkoutReady }: { course: Course; onOpen: (course: Course) => void; onEnroll: (course: Course) => void; enrolled: boolean; checkoutReady: boolean }) {
  const purchasable = course.id >= 1 && course.id <= 6 && course.instructor !== "أنت";
  return <article className="course-card">
    <button className={`course-cover ${course.color}`} onClick={() => onOpen(course)} aria-label={`عرض ${course.title}`}>
      <span className="cover-orbit orbit-one" /><span className="cover-orbit orbit-two" />
      <span className="cover-symbol">{course.icon}</span>
      {course.tag && <span className="cover-tag"><Sparkles size={12} />{course.tag}</span>}
      <span className="cover-meta">{course.category} <i /> {course.level}</span>
    </button>
    <div className="course-card-body">
      <div className="course-rating"><span><Star size={14} fill="currentColor" /> {course.rating}</span><span>{course.students} متعلّم</span></div>
      <button className="course-title" onClick={() => onOpen(course)}>{course.title}</button>
      <div className="course-instructor"><span className="tiny-avatar">{course.instructor.slice(0, 1)}</span>{course.instructor}<span className="course-lessons"><BookOpen size={14} />{course.lessons} درس</span></div>
      <div className="course-card-bottom"><strong>{money(course.price)}</strong><button className={enrolled ? "icon-action is-saved" : "icon-action"} onClick={() => onEnroll(course)} disabled={!enrolled && (!purchasable || !checkoutReady)} aria-label={enrolled ? "افتح الدورة" : purchasable ? checkoutReady ? "شراء الدورة" : "الدفع غير مفعّل حالياً" : "الدورة غير منشورة"}>{enrolled ? <Check size={17} /> : <CreditCard size={17} />}</button></div>
    </div>
  </article>;
}

function StatCard({ label, value, change, icon, tone, foot }: { label: string; value: string; change?: string; icon: React.ReactNode; tone: string; foot?: string }) {
  return <div className="stat-card"><div className="stat-head"><span className={`stat-icon ${tone}`}>{icon}</span>{change && <span className="stat-change"><ArrowUpLeft size={13} />{change}</span>}</div><div className="stat-label">{label}</div><div className="stat-value">{value}</div>{foot && <div className="stat-foot">{foot}</div>}</div>;
}

function RevenueChart() {
  const bars = [38, 53, 45, 68, 58, 77, 62, 88, 67, 82, 75, 100];
  const labels = ["أكتوبر", "نوفمبر", "ديسمبر", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر"];
  return <div className="chart-wrap" dir="ltr"><div className="chart-y-labels"><span>٣٠ ألف</span><span>٢٠ ألف</span><span>١٠ آلاف</span><span>٠</span></div><div className="chart-plot"><div className="chart-grid"><i /><i /><i /><i /></div><div className="chart-bars">{bars.map((height, i) => <div className="chart-bar-col" key={labels[i]}><div className={`chart-bar ${i === 11 ? "current" : ""}`} style={{ height: `${height}%` }} title={`${labels[i]}: ${height * 180} ر.س`} /><span>{labels[i].slice(0, 3)}</span></div>)}</div></div></div>;
}

export default function Home() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const paymentReadiness = trpc.billing.readiness.useQuery();
  const myCoursesQuery = trpc.billing.myCourses.useQuery(undefined, { enabled: isAuthenticated });
  const checkoutMutation = trpc.billing.checkoutCourse.useMutation();
  const [checkoutReturn] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return { kind: params.get("checkout"), sessionId: params.get("session_id") ?? "" };
  });
  const orderStatusInput = useMemo(() => ({ sessionId: checkoutReturn.sessionId || "cs_test_pending" }), [checkoutReturn.sessionId]);
  const orderStatus = trpc.billing.orderStatus.useQuery(orderStatusInput, {
    enabled: isAuthenticated && checkoutReturn.kind === "success" && Boolean(checkoutReturn.sessionId),
    refetchInterval: (query) => query.state.data?.status === "pending" && query.state.dataUpdateCount < 30 ? 2_000 : false,
  });
  const [view, setView] = useState<View>(() => new URLSearchParams(window.location.search).get("view") === "learning" ? "learning" : "discover");
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [category, setCategory] = useState("الكل");
  const [query, setQuery] = useState("");
  const myCourses = myCoursesQuery.data?.courseIds ?? [];
  const [savedCourses, setSavedCourses] = useState<number[]>([]);
  const [focusedCourse, setFocusedCourse] = useState<Course | null>(null);
  const [financeTab, setFinanceTab] = useState<FinanceTab>("balances");
  const [financeSearch, setFinanceSearch] = useState("");
  const [payoutFilter, setPayoutFilter] = useState("الكل");
  const [showCreate, setShowCreate] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newCourseCategory, setNewCourseCategory] = useState("التصميم");
  const [range, setRange] = useState("آخر ١٢ شهر");

  const filteredCourses = useMemo(() => courses.filter((course) => (category === "الكل" || course.category === category) && `${course.title} ${course.instructor} ${course.category}`.includes(query.trim())), [courses, category, query]);
  const enrolledCourses = courses.filter((course) => myCourses.includes(course.id));
  const visibleInstructors = instructors.filter((person) => `${person.name} ${person.email}`.includes(financeSearch));
  const visibleTransactions = transactions.filter((row) => `${row.instructor} ${row.course} ${row.id}`.includes(financeSearch));
  const visiblePayouts = payouts.filter((row) => (payoutFilter === "الكل" || row.status.includes(payoutFilter)) && `${row.name} ${row.id}`.includes(financeSearch));

  const go = (next: View) => {
    if (next === "learning") {
      if (!isAuthenticated) { startLogin(); return; }
      setShowMobileNav(false);
      setLocation("/dashboard");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setView(next); setShowMobileNav(false); setFocusedCourse(null); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const enroll = async (course: Course) => {
    if (myCourses.includes(course.id)) { go("learning"); return; }
    if (!isAuthenticated) { toast("سجّل الدخول أولاً", { description: "ستعود إلى رِواق لإتمام شراء الدورة." }); startLogin(); return; }
    if (course.id < 1 || course.id > 6 || course.instructor === "أنت") { toast.error("هذه المسودة غير منشورة ولا يمكن شراؤها."); return; }
    if (!paymentReadiness.data?.checkoutConfigured) { toast.error("الدفع غير مفعّل حالياً. أضف مفتاح Stripe التجريبي إلى أسرار المشروع."); return; }
    try {
      const result = await checkoutMutation.mutateAsync({ courseId: course.id });
      if (result.status === "owned") {
        await utils.billing.myCourses.invalidate();
        toast.success("الدورة متاحة في مسارك التعليمي");
        go("learning");
        return;
      }
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر بدء الدفع. حاول مرة أخرى.");
    }
  };
  useEffect(() => {
    if (orderStatus.data?.status === "paid") void utils.billing.myCourses.invalidate();
  }, [orderStatus.data?.status, utils]);
  const toggleSaved = (course: Course) => {
    setSavedCourses((old) => old.includes(course.id) ? old.filter((id) => id !== course.id) : [...old, course.id]);
    toast.success(savedCourses.includes(course.id) ? "أُزيلت من المحفوظات" : "حُفظت الدورة لوقت لاحق");
  };
  const createCourse = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newCourseTitle.trim()) { toast.error("اكتب عنوان الدورة أولاً"); return; }
    const fresh: Course = { id: Math.max(...courses.map((course) => course.id)) + 1, title: newCourseTitle.trim(), instructor: "أنت", category: newCourseCategory, level: "مبتدئ", lessons: 12, hours: 3, rating: "جديد", students: "٠", price: 149, color: "mint", icon: "✦", tag: "مسودة" };
    setCourses((old) => [fresh, ...old]); setNewCourseTitle(""); setShowCreate(false); toast.success("أُنشئت الدورة كمسودة", { description: "يمكنك متابعة إضافة المحتوى قبل نشرها." });
  };

  const sidebar = view === "instructor" || view === "ledger";
  const navItems = [
    { label: "استكشف الدورات", icon: <Search size={17} />, action: () => go("discover"), active: view === "discover" },
    { label: "مساري التعليمي", icon: <BookOpen size={17} />, action: () => go("learning"), active: view === "learning" },
  ];

  return <div className="app-shell" dir="rtl">
    <header className={`topbar ${sidebar ? "topbar-dashboard" : ""}`}>
      <div className="topbar-start"><button className="mobile-menu" onClick={() => setShowMobileNav(!showMobileNav)} aria-label="القائمة"><Menu size={21} /></button><Brand onClick={() => go("discover")} />{!sidebar && <nav className="public-nav"><button className={view === "discover" ? "nav-link active" : "nav-link"} onClick={() => go("discover")}>الرئيسية</button><button className="nav-link" onClick={() => { go("discover"); document.getElementById("courses")?.scrollIntoView({ behavior: "smooth" }); }}>الدورات</button><button className="nav-link" onClick={() => go("learning")}>لوحة الطالب</button><button className="nav-link" onClick={() => go("instructor")}>للمدرّسين</button></nav>}</div>
      <div className="topbar-end"><button className="top-search" onClick={() => { go("discover"); setTimeout(() => document.getElementById("course-search")?.focus(), 50); }}><Search size={16} /><span>ابحث عن دورة</span><kbd>⌘ K</kbd></button><div className="notification-wrap"><button className="round-action" aria-label="الإشعارات" onClick={() => setNotificationsOpen(!notificationsOpen)}><Bell size={18} /><i /></button>{notificationsOpen && <div className="notification-pop"><strong>إشعاراتك</strong><span><Check size={15} /> أُضيف درس جديد لمسار التصميم</span><span><Wallet size={15} /> تم تحديث ملخص الإيرادات</span><button onClick={() => setNotificationsOpen(false)}>إغلاق</button></div>}</div><button className="top-avatar" onClick={() => go("learning")} aria-label="لوحة الطالب">{user?.name?.trim().slice(0, 1) || "م"}</button></div>
    </header>

    {!sidebar && showMobileNav && <nav className="mobile-drawer" aria-label="قائمة التنقل">
      <button onClick={() => go("discover")}><Search size={17}/>استكشف الدورات</button>
      <button onClick={() => { go("discover"); setTimeout(() => document.getElementById("courses")?.scrollIntoView({ behavior: "smooth" }), 30); }}><BookOpen size={17}/>كل الدورات</button>
      <button onClick={() => go("learning")}><GraduationCap size={17}/>لوحة الطالب</button>
      <button onClick={() => go("instructor")}><LayoutDashboard size={17}/>مساحة المعلّم</button>
    </nav>}

    {sidebar && <aside className={`app-sidebar ${showMobileNav ? "open" : ""}`}>
      <div className="sidebar-section-label">مساحة العمل</div>
      <button className={view === "instructor" ? "side-link selected" : "side-link"} onClick={() => go("instructor")}><LayoutDashboard size={17} />نظرة عامة</button>
      <button className="side-link" onClick={() => { go("instructor"); setShowCreate(true); }}><BookOpen size={17} />دوراتي <span className="side-count">{courses.filter((course) => course.instructor === "أنت").length || "٤"}</span></button>
      <button className="side-link" onClick={() => go("learning")}><GraduationCap size={17} />الطلاب</button>
      <div className="sidebar-divider" />
      <div className="sidebar-section-label">الماليات</div>
      <button className={view === "ledger" && financeTab === "balances" ? "side-link selected" : "side-link"} onClick={() => { setFinanceTab("balances"); go("ledger"); }}><Wallet size={17} />دفتر الإيرادات</button>
      <button className={view === "ledger" && financeTab === "payouts" ? "side-link selected" : "side-link"} onClick={() => { setFinanceTab("payouts"); go("ledger"); }}><CreditCard size={17} />سجل الدفعات <span className="side-count alert-count">١</span></button>
      <button className={view === "ledger" && financeTab === "refunds" ? "side-link selected" : "side-link"} onClick={() => { setFinanceTab("refunds"); go("ledger"); }}><ArrowDownLeft size={17} />الاستردادات</button>
      <div className="sidebar-divider" />
      <button className="side-link" onClick={() => toast("إعدادات الحساب", { description: "إدارة الملف الشخصي وبيانات التحويل." })}><Settings2 size={17} />الإعدادات</button>
      <button className="side-link" onClick={() => toast("مركز المساعدة", { description: "فريق رِواق هنا لمساعدتك." })}><CircleHelp size={17} />المساعدة</button>
      <div className="sidebar-bottom"><div className="sidebar-plan"><span className="plan-icon"><Zap size={16} /></span><strong>مساحة المعلّم</strong><p>أنشئ دورة جديدة وشارك خبرتك مع آلاف المتعلمين.</p><button onClick={() => setShowCreate(true)}>أنشئ دورة <ArrowLeft size={14} /></button></div><div className="sidebar-profile"><span className="instructor-avatar">م</span><span><b>محمد العتيبي</b><small>مدرّس موثّق</small></span><MoreHorizontal size={19} /></div></div>
    </aside>}

    <main className={sidebar ? "main-content with-sidebar" : "main-content"}>
      {checkoutReturn.kind === "success" && <div className={`checkout-status-banner ${orderStatus.data?.status === "paid" ? "checkout-confirmed" : orderStatus.data?.status === "expired" ? "checkout-cancelled" : "checkout-waiting"}`} role="status"><ShieldCheck size={17}/><span><b>{orderStatus.data?.status === "paid" ? "تم تأكيد الدفع" : orderStatus.data?.status === "expired" ? "لم يكتمل الدفع" : "نتحقق من حالة الدفع"}</b> {orderStatus.data?.status === "paid" ? "أُضيفت الدورة إلى مسارك التعليمي." : orderStatus.data?.status === "expired" ? "انتهت جلسة الدفع أو لم تكتمل؛ لم نفتح الدورة." : orderStatus.isError ? "تعذّر التحقق مع Stripe الآن. لا نفتح الدورة حتى نسترجع حالتها الموثّقة." : "نجلب حالة الجلسة مباشرةً من Stripe؛ سيُفتح المسار عند اكتمال الدفع."}</span>{orderStatus.data?.status === "paid" && <button onClick={() => go("learning")}>افتح مسارك <ArrowLeft size={14}/></button>}</div>}
      {checkoutReturn.kind === "success" && !isAuthenticated && !authLoading && <div className="checkout-status-banner checkout-waiting" role="status"><ShieldCheck size={17}/><span><b>سجّل الدخول للتحقق من طلبك.</b> لا نمنح الوصول اعتماداً على رابط العودة وحده.</span><button onClick={() => startLogin()}>تسجيل الدخول</button></div>}
      {checkoutReturn.kind === "cancelled" && <div className="checkout-status-banner checkout-cancelled" role="status"><CreditCard size={17}/><span><b>لم يكتمل الدفع.</b> لم نفتح الدورة؛ يمكنك المحاولة مرة أخرى من بطاقة الدورة.</span></div>}
      {!paymentReadiness.isLoading && !paymentReadiness.data?.checkoutConfigured && view === "discover" && <div className="checkout-status-banner checkout-disabled"><ShieldCheck size={17}/><span><b>الدفع معطّل حالياً.</b> أضف <code>RIWAQ_STRIPE_SECRET_KEY</code> التجريبي إلى أسرار المشروع لتفعيل شراء الدورات.</span></div>}
      {paymentReadiness.data?.checkoutConfigured && <div className="checkout-status-banner checkout-test-mode"><ShieldCheck size={17}/><span><b>وضع الاختبار مفعل.</b> لا تُحصّل هذه التهيئة مدفوعات حقيقية.</span></div>}
      {view === "discover" && <>
        <section className="hero-section">
          <div className="hero-copy"><div className="eyebrow"><Sparkles size={14} /> تعلّم مهارة تغيّر مسارك</div><h1>مكانٌ يلتقي فيه<br /><em>الشغف بالمعرفة.</em></h1><p>دورات عملية يقدّمها خبراء عرب. تعلّم على مهل، وطبّق بثقة، واصنع خطوتك القادمة.</p><div className="hero-search"><Search size={19} /><input id="course-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ما المهارة التي تودّ تعلّمها؟" onKeyDown={(e) => e.key === "Enter" && document.getElementById("courses")?.scrollIntoView({ behavior: "smooth" })} /><button onClick={() => document.getElementById("courses")?.scrollIntoView({ behavior: "smooth" })}>اكتشف الدورات <ArrowLeft size={16} /></button></div><div className="hero-social"><div className="avatar-stack"><span>ن</span><span>ع</span><span>س</span><span>ل</span></div><span><b>أكثر من ٢٤ ألف</b><small>متعلّم بدأوا رحلتهم هنا</small></span><i className="social-sep" /><span className="social-rating"><Star fill="currentColor" size={15} /> ٤٫٩ <small>تقييم المتعلمين</small></span></div></div>
          <div className="hero-art"><div className="hero-image-wrap"><img src="/manus-storage/riwaq-learning-group_971549d9.jpg" alt="مجموعة متعلمين يتشاركون المعرفة" /><div className="image-wash" /></div><div className="hero-orbit hero-orbit-a"/><div className="hero-orbit hero-orbit-b"/><div className="floating-note note-top"><span className="note-icon coral"><Award size={17} /></span><span><b>خطوة جديدة!</b><small>أكملت درسَك الخامس</small></span><span className="note-check"><Check size={14} /></span></div><div className="floating-note note-bottom"><div className="note-ring"><GraduationCap size={18} /></div><span><b>تعلّمك يصنع فرقاً</b><small>٦ ساعات هذا الأسبوع</small><span className="mini-bars"><i/><i/><i/><i/><i/><i/><i/></span></span><span className="note-arrow"><ArrowUpRight size={16}/></span></div><span className="hero-spark spark-one">✳</span><span className="hero-spark spark-two">✧</span></div>
          <div className="hero-side-note"><span className="side-note-line"/>من خبراء يشبهونك</div>
        </section>

        <section className="trust-strip"><div className="trust-item"><span className="trust-symbol"><ShieldCheck size={19} /></span><span><b>تعلّم موثوق</b><small>محتوى يراجعه خبراء</small></span></div><div className="trust-item"><span className="trust-symbol peach-symbol"><Clock3 size={19} /></span><span><b>تعلّم على وقتك</b><small>وصول دائم للدروس</small></span></div><div className="trust-item"><span className="trust-symbol blue-symbol"><Award size={19} /></span><span><b>شهادات إنجاز</b><small>أبرز مهاراتك الجديدة</small></span></div><div className="trust-item"><span className="trust-symbol green-symbol"><Headphones size={19} /></span><span><b>مجتمع يساندك</b><small>اسأل وتبادل الخبرة</small></span></div><div className="trust-count"><b>+١٢٠</b><span>دورة تنمو معك</span></div></section>

        <section className="courses-section" id="courses"><div className="section-heading"><div><span className="section-kicker">مسارات مختارة</span><h2>تعلّم ما <em>تحبّ.</em></h2><p>بداية صغيرة، وأثر كبير. اختر مهارتك القادمة.</p></div><button className="text-link" onClick={() => { setCategory("الكل"); setQuery(""); document.getElementById("courses")?.scrollIntoView({ behavior: "smooth" }); }}>كل الدورات <ArrowLeft size={16} /></button></div>
          <div className="category-row">{categories.map((item) => <button key={item} className={category === item ? "category-chip active" : "category-chip"} onClick={() => setCategory(item)}>{item === "الكل" && <Sparkles size={13} />}{item}</button>)}<span className="category-count">{filteredCourses.length} دورات</span></div>
          <div className="course-grid">{filteredCourses.length ? filteredCourses.map((course) => <CourseCard key={course.id} course={course} onOpen={setFocusedCourse} onEnroll={enroll} enrolled={myCourses.includes(course.id)} checkoutReady={Boolean(paymentReadiness.data?.checkoutConfigured)} />) : <div className="empty-courses"><Search size={24}/><b>لم نعثر على دورة بهذا البحث</b><span>جرّب كلمة أخرى أو اختر تصنيفاً مختلفاً.</span><button onClick={() => { setQuery(""); setCategory("الكل"); }}>عرض كل الدورات</button></div>}</div>
        </section>
        <section className="mentor-banner"><div className="mentor-art"><div className="mentor-disc"><GraduationCap size={45}/></div><span className="mentor-orbit m-orbit-one"/><span className="mentor-orbit m-orbit-two"/><span className="mentor-star">✦</span></div><div className="mentor-copy"><span className="section-kicker">لأصحاب الخبرة</span><h2>خبرتك تستحق<br /><em>أن تُشارك.</em></h2><p>اصنع دورة، وابنِ مجتمعاً حول ما تتقنه. رِواق يمنحك أدوات التعليم وإحصاءات واضحة عن نمو دخلك.</p><button className="button-dark" onClick={() => go("instructor")}>اكتشف مساحة المعلّم <ArrowLeft size={16} /></button></div><div className="mentor-stat"><span className="mentor-stat-icon"><Wallet size={18}/></span><b>دفتر إيرادات واضح</b><small>كل حصة، وكل استحقاق — بسجلّ دقيق.</small><span className="mentor-stat-bar"><i/></span><span className="mentor-stat-foot">توزيعٌ منصف، وشفافية في كل خطوة</span></div></section>
        <section className="quote-strip"><span className="quote-mark">“</span><p>التعلّم الحقيقي لا ينتهي عند مشاهدة الدرس؛ يبدأ حين يصبح ما تعلّمته جزءاً من يومك.</p><span className="quote-by"><span className="tiny-avatar">ر</span>من مجتمع رِواق</span></section>
      </>}

      {view === "learning" && <section className="learning-page page-pad"><div className="page-breadcrumb"><button onClick={() => go("discover")}>الرئيسية</button><ChevronLeft size={14}/><span>مساري التعليمي</span></div><div className="page-header learning-header"><div><span className="section-kicker">كل خطوة تُحسب</span><h1>أهلاً بعودتك، <em>محمد.</em></h1><p>أكمل من حيث وصلت، أو اختر مهارة جديدة تودّ استكشافها.</p></div><button className="button-dark" onClick={() => go("discover")}>اكتشف دورة جديدة <ArrowLeft size={16}/></button></div><div className="learning-overview"><div className="learning-overview-main"><span className="learning-overline"><Sparkles size={14}/>ملخّص رحلتك</span><div className="learning-numbers"><div><b>٢</b><span>دورتان في مسارك</span></div><div><b>١١<span>س</span></b><span>ساعة من التعلّم</span></div><div><b>٥</b><span>دروس هذا الأسبوع</span></div></div><div className="weekly-progress"><span>هدفك الأسبوعي</span><div className="weekly-track"><i style={{ width: "68%" }} /></div><b>٤ / ٦ ساعات</b></div></div><div className="learning-streak"><div className="streak-icon">✦</div><b>أنت على الطريق الصحيح!</b><p>حافظ على إيقاعك الجميل. ١٢ دقيقة اليوم تكفي لتُحدث فرقاً.</p><div className="week-dots"><span>س</span><span>ح</span><span>ن</span><span>ث</span><span>ر</span><span>خ</span><span>ج</span></div><button onClick={() => enrolledCourses[0] && setFocusedCourse(enrolledCourses[0])}>تابع التعلّم <ArrowLeft size={14}/></button></div></div><div className="section-heading compact-heading"><div><span className="section-kicker">مسارك الآن</span><h2>دوراتك <em>النشطة.</em></h2></div><span className="muted-inline">{enrolledCourses.length} دورات</span></div><div className="learning-course-list">{enrolledCourses.map((course) => <article className="learning-course" key={course.id}><button className={`learning-thumb ${course.color}`} onClick={() => setFocusedCourse(course)}><span>{course.icon}</span><i><Play size={15} fill="currentColor" /></i></button><div className="learning-course-info"><div className="learning-course-title-row"><div><span className="learning-course-category">{course.category} <i/> {course.instructor}</span><h3>{course.title}</h3></div><button className="icon-action" onClick={() => setFocusedCourse(course)} aria-label="متابعة الدورة"><ArrowLeft size={17}/></button></div><div className="progress-meta"><span>مستوى التقدّم</span><b>{course.progress || 0}%</b></div><div className="progress-track"><i style={{ width: `${course.progress || 0}%` }}/></div><div className="learning-course-bottom"><span><BookOpen size={14}/>{course.lessons} درس</span><span><Clock3 size={14}/>{course.hours} ساعات</span><button onClick={() => setFocusedCourse(course)}>{course.progress ? "متابعة التعلّم" : "ابدأ الدورة"}<ArrowLeft size={14}/></button></div></div></article>)}<button className="add-course-card" onClick={() => go("discover")}><span><Plus size={18}/></span><b>ابدأ مهارة جديدة</b><small>اكتشف الدورات المختارة لك</small></button></div></section>}

      {view === "instructor" && <section className="dashboard-page"><div className="dashboard-topline"><div className="page-breadcrumb"><button onClick={() => go("discover")}>رِواق</button><ChevronLeft size={14}/><span>مساحة المعلّم</span></div><div className="dash-tools"><span className="verified-pill"><ShieldCheck size={14}/> حساب موثّق</span><button className="date-select" onClick={() => setRange(range === "آخر ١٢ شهر" ? "آخر ٣٠ يوم" : "آخر ١٢ شهر")}>{range}<ChevronDown size={15}/></button><button className="button-dark small-button" onClick={() => setShowCreate(true)}><Plus size={16}/> إنشاء دورة</button></div></div><div className="dashboard-welcome"><div><span className="section-kicker">الجمعة، ٢٥ سبتمبر ٢٠٢٦</span><h1>صباح الخير، <em>محمد.</em></h1><p>إليك لمحة عن أثر معرفتك خلال هذا الشهر.</p></div><div className="dashboard-avatar-wrap"><span className="dashboard-avatar">م</span><div><b>محمد العتيبي</b><span>مدرّس منذ مارس ٢٠٢٤</span></div><span className="gold-dot">✦</span></div></div><div className="dashboard-stats"><StatCard label="إجمالي الإيرادات المكتسبة" value="٨٦٬٥٦٠ ر.س" change="١٨٫٤٪" icon={<Wallet size={19}/>} tone="stat-violet" foot="مقارنةً بالفترة السابقة"/><StatCard label="الرصيد المتاح للتحويل" value="٤٢٬٧٦٠ ر.س" icon={<CreditCard size={19}/>} tone="stat-green" foot="بعد حجز الدفعات قيد التنفيذ"/><StatCard label="طلاب التحقوا بدوراتك" value="١٬٨٤٢" change="١٢٫٨٪" icon={<GraduationCap size={19}/>} tone="stat-peach" foot="خلال جميع الدورات المنشورة"/><StatCard label="تقييمك العام" value="٤٫٩ / ٥" icon={<Star size={19}/>} tone="stat-blue" foot="من ٣٢٦ تقييماً موثّقاً"/></div><div className="dashboard-columns"><div className="panel revenue-panel"><div className="panel-heading"><div><span className="section-kicker">نموّ ثابت</span><h2>الإيرادات <em>عبر الوقت.</em></h2></div><button className="more-button" aria-label="خيارات الرسم" onClick={() => toast("الرسم البياني", { description: "يعرض الإيراد المُعترف به شهرياً." })}><MoreHorizontal size={20}/></button></div><div className="revenue-current"><b>١٢٬٨٤٠ <small>ر.س</small></b><span><ArrowUpLeft size={13}/>١١٫٢٪</span><small>هذا الشهر</small></div><RevenueChart/><div className="chart-legend"><span><i/>إيرادات مكتسبة</span><span><i className="legend-pale"/>الفترة السابقة</span><span className="chart-footnote">الاعتراف بالإيراد يومي على مدى الاشتراك المدفوع مسبقاً.</span></div></div><div className="panel balance-panel"><div className="panel-heading"><div><span className="section-kicker">أموالك، بوضوح</span><h2>ملخّص <em>الرصيد.</em></h2></div><span className="balance-icon"><Wallet size={19}/></span></div><div className="balance-total"><span>الرصيد المتاح</span><b>٤٢٬٧٦٠ <small>ر.س</small></b><small>يُحدّث الرصيد مع اكتساب الدخل وتسوية التحويلات.</small></div><div className="balance-breakdown"><div><span><i className="balance-dot earned-dot"/>مكتسب</span><b>٨٢٬٤٦٠ ر.س</b></div><div><span><i className="balance-dot paid-dot"/>مدفوع</span><b>٤٢٬٩٠٠ ر.س</b></div><div><span><i className="balance-dot reserve-dot"/>محجوز للتحويل</span><b>٩٠٠ ر.س</b></div></div><button className="balance-link" onClick={() => go("ledger")}>عرض دفتر الإيرادات <ArrowLeft size={15}/></button><div className="balance-note"><ShieldCheck size={15}/><span>توزيع دقيق بالهللات، وسجلّ مالي قابل للمراجعة.</span></div></div></div><div className="panel recent-panel"><div className="panel-heading"><div><span className="section-kicker">آخر النشاط</span><h2>ما يحدث <em>الآن.</em></h2></div><button className="text-link" onClick={() => go("ledger")}>عرض السجل الكامل <ArrowLeft size={15}/></button></div><div className="activity-list"><div className="activity-row"><span className="activity-icon pale-green"><GraduationCap size={17}/></span><div><b>طالبة جديدة في دورة التصميم</b><small>أساسيات التصميم وتجربة المستخدم · اكتساب يبدأ الآن</small></div><span className="activity-amount">+١٧٠ ر.س <small>من نصيب الدورة</small></span><span className="activity-time">منذ ٢ ساعة</span></div><div className="activity-row"><span className="activity-icon pale-blue"><CreditCard size={17}/></span><div><b>تمت تسوية دفعة إلى حسابك</b><small>دفعة رقم PO-00819 · تحويل آمن</small></div><span className="activity-amount">٢٬٤٠٠ ر.س <small>تم التحويل</small></span><span className="activity-time">أمس</span></div><div className="activity-row"><span className="activity-icon pale-orange"><FileText size={17}/></span><div><b>استحقاق شهري جديد</b><small>اكتمل الاعتراف بإيرادات اشتراك شهر أغسطس</small></div><span className="activity-amount">+٨٤٠ ر.س <small>أُضيف إلى المكتسب</small></span><span className="activity-time">٢٣ سبتمبر</span></div></div></div></section>}

      {view === "ledger" && <section className="ledger-page"><div className="ledger-header"><div><div className="page-breadcrumb"><button onClick={() => go("instructor")}>مساحة المعلّم</button><ChevronLeft size={14}/><span>دفتر الإيرادات</span></div><span className="section-kicker">كل مبلغ له قصّة</span><h1>دفتر <em>الإيرادات.</em></h1><p>سجلّ واضح للاستحقاقات، والأرصدة، والتسويات — دون أي تغيير على سجلات الماضي.</p></div><div className="ledger-actions"><span className="read-only-pill"><Eye size={14}/> عرض للقراءة فقط</span><button className="export-button" onClick={() => { const csv = ["الرقم,المدرّس,الدورة,الإجمالي,رسم المنصة,حصة المدرّس,المكتسب", ...transactions.map((r) => `${r.id},${r.instructor},${r.course},${r.gross},${r.fee},${r.share},${r.earned}`)].join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })); a.download = "riwaq-revenue-ledger.csv"; a.click(); URL.revokeObjectURL(a.href); toast.success("تم تنزيل كشف تجريبي بصيغة CSV"); }}><Download size={16}/>تصدير كشف</button></div></div><div className="ledger-demo-note"><ShieldCheck size={16}/><span><b>بيئة عرض توضيحي</b> — الأسماء والأرصدة والدفعات هنا بيانات تجريبية؛ لا يجري تنفيذ تحويلات مالية حقيقية.</span><button onClick={() => toast("كيف يُحتسب الرصيد؟", { description: "المكتسب يُوزّع يومياً، والمتاح = المكتسب − المدفوع − المحجوز. المبالغ محفوظة بوحدات صحيحة، لا بأعداد عشرية.", duration: 6000 })}>كيف يُحتسب؟ <ArrowLeft size={14}/></button></div><div className="ledger-summary-grid"><StatCard label="إجمالي الإيراد المُعترف به" value="٨٦٬٥٦٠ ر.س" change="١٣٫٢٪" icon={<ArrowUpLeft size={19}/>} tone="stat-violet" foot="حتى ٢٥ سبتمبر ٢٠٢٦"/><StatCard label="متاح للتحويل" value="٤٢٬٧٦٠ ر.س" icon={<Wallet size={19}/>} tone="stat-green" foot="بعد خصم المحجوز والمدفوع"/><StatCard label="دفعات قيد التحقق" value="٩٠٠ ر.س" icon={<Clock3 size={19}/>} tone="stat-amber" foot="محجوزة حتى تأكيد المزوّد"/><StatCard label="استرداد غير مكتسب" value="١٨٠ ر.س" icon={<ArrowDownLeft size={19}/>} tone="stat-blue" foot="وفق سياسة الوقت غير المستخدم"/></div><div className="ledger-tabs">{([{ id: "balances", name: "أرصدة المدرّسين", icon: <Wallet size={16}/> }, { id: "allocations", name: "توزيعات الإيراد", icon: <ArrowUpLeft size={16}/> }, { id: "payouts", name: "سجلّ الدفعات", icon: <CreditCard size={16}/> }, { id: "refunds", name: "الاستردادات", icon: <ArrowDownLeft size={16}/> }] as const).map((tab) => <button key={tab.id} onClick={() => { setFinanceTab(tab.id); setFinanceSearch(""); }} className={financeTab === tab.id ? "ledger-tab active" : "ledger-tab"}>{tab.icon}{tab.name}{tab.id === "payouts" && <i className="tab-alert">١</i>}</button>)}</div><section className="panel ledger-table-panel"><div className="ledger-table-top"><div><h2>{financeTab === "balances" ? "أرصدة المدرّسين" : financeTab === "allocations" ? "توزيعات الإيراد" : financeTab === "payouts" ? "محاولات التحويل" : "طلبات الاسترداد"}</h2><p>{financeTab === "balances" ? "لقطة حالية؛ سجل الدفعات يظل مرجع التسوية." : financeTab === "allocations" ? "حصص محفوظة عند التحصيل — واكتساب يومي طوال مدة الاشتراك." : financeTab === "payouts" ? "حالات واضحة، ومفتاح فريد لكل نية تحويل." : "تُردّ قيمة الأيام غير المكتسبة فقط في سياسة العرض هذه."}</p></div><div className="table-tools"><label className="table-search"><Search size={15}/><input value={financeSearch} onChange={(e) => setFinanceSearch(e.target.value)} placeholder={financeTab === "balances" ? "ابحث عن مدرّس..." : "بحث في السجل..."}/></label>{financeTab === "payouts" && <select className="filter-select" value={payoutFilter} onChange={(e) => setPayoutFilter(e.target.value)} aria-label="تصفية حالة الدفعة"><option>الكل</option><option>ناجحة</option><option>قيد التحقق</option><option>فشلت</option></select>}<button className="filter-button" onClick={() => { setFinanceSearch(""); setPayoutFilter("الكل"); toast("أُعيدت عوامل التصفية"); }}><Filter size={15}/><span>تصفية</span></button></div></div><div className="table-scroll">
        {financeTab === "balances" && <table><thead><tr><th>المدرّس</th><th>العملة</th><th>المكتسب</th><th>محجوز</th><th>مدفوع</th><th>المتاح</th><th>آخر دفعة</th><th></th></tr></thead><tbody>{visibleInstructors.map((row) => <tr key={row.email}><td><span className="table-person"><i className={`person-avatar ${row.tone}`}>{row.initials}</i><span><b>{row.name}</b><small>{row.email}</small></span></span></td><td><span className="currency-pill">SAR</span></td><td>{money(row.earned)}</td><td className="muted-cell">{money(row.reserved)}</td><td className="muted-cell">{money(row.paid)}</td><td><b className="available-amount">{money(row.available)}</b></td><td><span className={`last-status ${row.last.includes("التحقق") ? "status-pending" : ""}`}><i/>{row.last}</span></td><td><button className="row-more" aria-label="عرض السجل" onClick={() => { setFinanceTab("payouts"); setFinanceSearch(row.name); }}><MoreHorizontal size={18}/></button></td></tr>)}</tbody></table>}
        {financeTab === "allocations" && <table><thead><tr><th>رقم التخصيص</th><th>المدرّس</th><th>الدورة</th><th>قيمة الدفع</th><th>رسم المنصة · ١٠٪</th><th>حصة المدرّس</th><th>مكتسب حتى الآن</th><th>الحالة</th></tr></thead><tbody>{visibleTransactions.map((row) => <tr key={row.id}><td><code className="mono-id">{row.id}</code></td><td><span className="table-person"><i className={`person-avatar ${row.hue}`}>{row.instructor.slice(0,1)}</i><b>{row.instructor}</b></span></td><td className="course-cell">{row.course}</td><td>{money(row.gross)}</td><td className="muted-cell">{money(row.fee)}</td><td><b>{money(row.share)}</b></td><td>{money(row.earned)}</td><td><span className={`allocation-state ${row.state.includes("مكتمل") ? "state-complete" : "state-recurring"}`}><i/>{row.state}</span></td></tr>)}</tbody></table>}
        {financeTab === "payouts" && <table><thead><tr><th>رقم الدفعة</th><th>المدرّس</th><th>المبلغ</th><th>الحالة</th><th>معرّف المزوّد</th><th>عدد المحاولات</th><th>التاريخ</th><th></th></tr></thead><tbody>{visiblePayouts.map((row, i) => <tr key={row.id}><td><code className="mono-id">{row.id}</code></td><td><span className="table-person"><i className={`person-avatar ${row.color}`}>{row.name.slice(0,1)}</i><b>{row.name}</b></span></td><td><b>{money(row.amount)}</b></td><td><span className={`payout-status ${row.color}`}><i/>{row.status}</span></td><td><code className="mono-ref">{row.ref}</code></td><td>{row.color === "amber" ? "٢" : i === 4 ? "١" : "١"}</td><td>{row.date}</td><td><button className="row-more" onClick={() => toast(`تفاصيل ${row.id}`, { description: `المعلّم: ${row.name} · المبلغ: ${money(row.amount)} · ${row.status}. كل إعادة محاولة لنفس النية تعيد استخدام مفتاح idempotency ذاته.` })} aria-label="تفاصيل الدفعة"><Eye size={16}/></button></td></tr>)}</tbody></table>}
        {financeTab === "refunds" && <table><thead><tr><th>رقم الاسترداد</th><th>الدورة</th><th>قيمة الاشتراك</th><th>المبلغ المسترد</th><th>سياسة التوزيع</th><th>الحالة</th><th>تاريخ الطلب</th><th></th></tr></thead><tbody>{[{ id: "RF-00128", course: "تصوير المنتجات بالجوال", gross: 139, amount: 34, state: "مكتمل", date: "٢٢ سبتمبر ٢٠٢٦" }, { id: "RF-00127", course: "أساسيات التصميم وتجربة المستخدم", gross: 189, amount: 18, state: "قيد المراجعة", date: "٢٠ سبتمبر ٢٠٢٦" }, { id: "RF-00126", course: "التسويق الرقمي من الصفر للاحتراف", gross: 159, amount: 12, state: "مكتمل", date: "١٨ سبتمبر ٢٠٢٦" }].filter((row) => `${row.course} ${row.id}`.includes(financeSearch)).map((row) => <tr key={row.id}><td><code className="mono-id">{row.id}</code></td><td className="course-cell">{row.course}</td><td>{money(row.gross)}</td><td><b>{money(row.amount)}</b></td><td className="refund-policy">الوقت غير المكتسب فقط</td><td><span className={`payout-status ${row.state === "مكتمل" ? "green" : "amber"}`}><i/>{row.state}</span></td><td>{row.date}</td><td><button className="row-more" onClick={() => toast("تفاصيل الاسترداد", { description: "لا تُسترد الإيرادات المكتسبة سابقاً؛ يُخصّص المبلغ على الحصص غير المكتسبة نسبياً." })}><Eye size={16}/></button></td></tr>)}</tbody></table>}
        {((financeTab === "balances" && visibleInstructors.length === 0) || (financeTab === "allocations" && visibleTransactions.length === 0) || (financeTab === "payouts" && visiblePayouts.length === 0)) && <div className="no-results">لا توجد نتائج مطابقة — جرّب تغيير عبارة البحث.</div>}
      </div><div className="table-footer"><span>عرض <b>{financeTab === "balances" ? visibleInstructors.length : financeTab === "allocations" ? visibleTransactions.length : financeTab === "payouts" ? visiblePayouts.length : 3}</b> من <b>{financeTab === "balances" ? 1240 : financeTab === "allocations" ? 5428 : financeTab === "payouts" ? 824 : 128} سجلّ</b></span><div className="pagination"><button disabled><ChevronRight size={16}/></button><button className="page-current">١</button><button onClick={() => toast("صفحة العرض التجريبي", { description: "تم توفير الصفحة الأولى من السجلات لتوضيح التصميم." })}>٢</button><button onClick={() => toast("صفحة العرض التجريبي", { description: "تم توفير الصفحة الأولى من السجلات لتوضيح التصميم." })}>٣</button><span>…</span><button onClick={() => toast("صفحة العرض التجريبي", { description: "تم توفير الصفحة الأولى من السجلات لتوضيح التصميم." })}>٨٢</button><button onClick={() => toast("صفحة العرض التجريبي", { description: "تم توفير الصفحة الأولى من السجلات لتوضيح التصميم." })}><ChevronLeft size={16}/></button></div></div></section><div className="ledger-footnotes"><span><i/>القيم المالية محفوظة بوحدات صحيحة؛ لا حسابات بفاصلة عائمة.</span><span><i/>التوزيع النسبي يستخدم أكبر البواقي لكسر الهللات بالتساوي.</span><span><i/>لا يتغير سجل التخصيص بعد إنشاء لقطة الدفع.</span></div></section>}
    </main>

    {!sidebar && <footer className="site-footer"><Brand onClick={() => go("discover")}/><span>تعلّم يُشبهك. معرفة تبقى معك.</span><span>© رِواق ٢٠٢٦</span><button onClick={() => toast("سياسة الخصوصية", { description: "تعرّف على كيفية حماية رِواق لبياناتك." })}>الخصوصية</button><button onClick={() => toast("تواصل معنا", { description: "مرحباً، اكتب لنا على hello@riwaq.academy" })}>تواصل معنا</button></footer>}

    {focusedCourse && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFocusedCourse(null); }}><section className="course-dialog" role="dialog" aria-modal="true" aria-label={`تفاصيل ${focusedCourse.title}`}><button className="modal-close" onClick={() => setFocusedCourse(null)} aria-label="إغلاق"><X size={19}/></button><div className={`dialog-cover ${focusedCourse.color}`}><span>{focusedCourse.icon}</span><small>{focusedCourse.category} · {focusedCourse.level}</small><span className="dialog-cover-spark">✳</span></div><div className="dialog-content"><span className="section-kicker">دورة مختارة في {focusedCourse.category}</span><h2>{focusedCourse.title}</h2><div className="dialog-teacher"><span className="tiny-avatar">{focusedCourse.instructor.slice(0,1)}</span><span>يقدّمها <b>{focusedCourse.instructor}</b></span><span className="dialog-rating"><Star size={14} fill="currentColor"/> {focusedCourse.rating}</span></div><p>تعلّم بخطوات عملية واضحة، وطبّق المفاهيم مباشرة على مشروع يساعدك في حياتك المهنية. وصول دائم للمحتوى وتحديثاته.</p><div className="dialog-info-grid"><span><BookOpen size={16}/>{focusedCourse.lessons} درساً</span><span><Clock3 size={16}/>{focusedCourse.hours} ساعات محتوى</span><span><Award size={16}/>شهادة إنجاز</span><span><Headphones size={16}/>تعلم بالسرعة التي تناسبك</span></div><div className="curriculum-preview"><b>ما ستتعلّمه</b><span><Check size={15}/>المفاهيم الأساسية والأدوات العملية</span><span><Check size={15}/>تطبيقات واقعية ومشروع قابل للمشاركة</span><span><Check size={15}/>خطوات واضحة تساعدك على الاستمرار</span></div><div className="dialog-cta"><div><small>سعر الدورة</small><b>{money(focusedCourse.price)}</b><span>دفع لمرة واحدة · وصول دائم</span></div><button className="button-dark" onClick={() => enroll(focusedCourse)} disabled={checkoutMutation.isPending || (!myCourses.includes(focusedCourse.id) && !paymentReadiness.data?.checkoutConfigured)}>{myCourses.includes(focusedCourse.id) ? "افتح دورتي" : checkoutMutation.isPending ? "جارٍ تجهيز الدفع…" : paymentReadiness.data?.checkoutConfigured ? "اشترِ الدورة" : "الدفع غير مفعّل"}<ArrowLeft size={15}/></button><button className="dialog-save" onClick={() => toggleSaved(focusedCourse)} aria-label="حفظ"><Bookmark size={17} fill={savedCourses.includes(focusedCourse.id) ? "currentColor" : "none"}/></button></div><div className="dialog-safe"><ShieldCheck size={14}/>يفتح Stripe لإتمام الدفع؛ لا نفتح الدورة حتى يصل تأكيد الدفع الموثّق.</div></div></section></div>}

    {showCreate && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}><section className="create-dialog" role="dialog" aria-modal="true" aria-label="إنشاء دورة"><button className="modal-close" onClick={() => setShowCreate(false)} aria-label="إغلاق"><X size={19}/></button><span className="section-kicker">خطوة أولى نحو مشاركة خبرتك</span><h2>دورة جديدة، <em>وأثر جديد.</em></h2><p>أنشئ مسودة الدورة، ثم أضف الدروس والتفاصيل قبل النشر.</p><form onSubmit={createCourse}><label>عنوان الدورة<input autoFocus value={newCourseTitle} onChange={(e) => setNewCourseTitle(e.target.value)} placeholder="مثال: مقدمة في التفكير التصميمي" maxLength={90}/></label><label>التصنيف<select value={newCourseCategory} onChange={(e) => setNewCourseCategory(e.target.value)}>{categories.filter((item) => item !== "الكل").map((item) => <option key={item}>{item}</option>)}</select></label><div className="create-dialog-actions"><button type="button" className="cancel-button" onClick={() => setShowCreate(false)}>إلغاء</button><button className="button-dark" type="submit"><Plus size={16}/> إنشاء المسودة</button></div></form><div className="create-note"><ShieldCheck size={15}/>ستُحفظ كمسودة؛ لن تظهر للطلاب قبل مراجعتها ونشرها.</div></section></div>}
  </div>;
}
