import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useSession } from "@/lib/use-session";
import { STATIC_SITE } from "@/lib/deployment";
import { paymentAction } from "@/lib/payments";
import { PhoneVerify } from "@/components/PhoneVerify";
import {
  Bell, BriefcaseBusiness, Check, ChevronLeft, ChevronRight, CircleUserRound,
  Clock3, Compass, CreditCard, Home, ListFilter, Map, MapPin, Navigation,
  Plus, Route as RouteIcon, Search, ShieldCheck, Sparkles, Star, UserRound,
  WalletCards, X, Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ahmedProfile from "@/assets/ahmed-profile.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Helpy — små uppdrag, nära dig" },
      { name: "description", content: "Behöver du hjälp? Lägg ut ett uppdrag och få hjälp av någon nära dig." },
      { property: "og:title", content: "Helpy — små uppdrag, nära dig" },
      { property: "og:description", content: "Vad behöver du hjälp med? Någon i närheten kan fixa det." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: App,
});

type View = "home" | "explore" | "activity" | "profile";
type Profile = { id: string; display_name: string; avatar_url: string | null };
type Job = Tables<"jobs"> & { emoji: string; urgent: boolean; requester?: Profile | undefined };

const EMOJI: Record<string, string> = { Akut: "⚡", Transport: "🚗", "Ärende": "🛒", Hem: "🏠", "Hämtning": "📦", "Småjobb": "🔧", Djur: "🐕" };
const payoutOf = (price: number) => Math.round(price * 0.85);

function timeAgo(iso: string) {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m} min sedan`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} tim sedan`;
  return `${Math.round(h / 24)} dagar sedan`;
}

async function withProfiles(rows: Tables<"jobs">[]): Promise<Job[]> {
  const ids = [...new Set(rows.flatMap((r) => [r.requester_id, r.helper_id]).filter(Boolean))] as string[];
  const { data: profs } = ids.length ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", ids) : { data: [] as Profile[] };
  const map = new globalThis.Map((profs ?? []).map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, emoji: EMOJI[r.category] ?? "✨", urgent: r.category === "Akut", requester: map.get(r.requester_id) }));
}

async function fetchOpenJobs() {
  const { data, error } = await supabase.from("jobs").select("*").eq("status", "open").order("created_at", { ascending: false });
  if (error) throw error;
  return withProfiles(data);
}

function guessJob(text: string) {
  const t = text.toLowerCase();
  const rules: [string, string[]][] = [
    ["Akut", ["akut", "snabbt", "bensin", "fast", "dog", "nu direkt", "låst"]],
    ["Hämtning", ["paket", "hämta", "postnord", "dhl", "lämna"]],
    ["Ärende", ["handla", "coop", "ica", "affär", "apotek", "köpa"]],
    ["Transport", ["flytta", "bära", "soffa", "kartong", "skjuts", "bil"]],
    ["Djur", ["hund", "katt", "rasta", "djur"]],
    ["Småjobb", ["montera", "tv", "laga", "fixa", "skruva", "borra"]],
    ["Hem", ["städa", "tvätta", "trädgård", "gräs", "fönster"]],
  ];
  const category = rules.find(([, words]) => words.some((w) => t.includes(w)))?.[0] ?? "Småjobb";
  const first = text.trim().split(/[.!?\n]/)[0] ?? "";
  const title = first.length > 40 ? first.slice(0, 40).trim() + "…" : first;
  const suggested: Record<string, number> = { Akut: 500, "Hämtning": 150, "Ärende": 200, Transport: 350, Djur: 200, "Småjobb": 400, Hem: 300 };
  return { category, title: title.charAt(0).toUpperCase() + title.slice(1), suggested: suggested[category] ?? 300 };
}

const nav = [
  { id: "home" as const, label: "Hem", icon: Home },
  { id: "explore" as const, label: "Utforska", icon: Compass },
  { id: "activity" as const, label: "Aktivitet", icon: BriefcaseBusiness },
  { id: "profile" as const, label: "Profil", icon: CircleUserRound },
];

function Avatar({ p, size = "size-14" }: { p?: Profile | null | undefined; size?: string }) {
  if (p?.display_name === "Ahmed" && !p.avatar_url) return <img src={ahmedProfile} alt="Ahmed" width={816} height={816} className={`${size} rounded-full object-cover`} />;
  return <div className={`${size} flex shrink-0 items-center justify-center rounded-full bg-accent text-lg font-extrabold text-accent-foreground`}>{(p?.display_name ?? "?").charAt(0).toUpperCase()}</div>;
}

function App() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [view, setView] = useState<View>("home");
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("stripe");
    if (result === "paid" || result === "cancelled") setView("activity");
    if (result?.startsWith("connect-")) setView("profile");
    // The return URL only chooses a view. The server verifies actual payment state.
  }, []);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const { data: jobs = [], isLoading } = useQuery({ queryKey: ["jobs", "open"], queryFn: fetchOpenJobs });
  const { data: me } = useQuery({ queryKey: ["profile", user?.id], enabled: !!user, queryFn: async () => (await supabase.from("profiles").select("id, display_name, avatar_url").eq("id", user!.id).maybeSingle()).data });
  const [verifyOpen, setVerifyOpen] = useState<null | (() => void)>(null);
  const requireAuth = () => { if (!user) { navigate({ to: "/auth" }); return false; } return true; };
  const requireVerified = (next: () => void) => { if (!requireAuth()) return; if (!PHONE_REQUIRED || user?.phone_confirmed_at) next(); else setVerifyOpen(() => next); };
  const openCreate = () => requireVerified(() => setCreateOpen(true));
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-card px-5 py-7 lg:flex lg:flex-col">
        <Brand />
        <nav className="mt-12 space-y-2" aria-label="Huvudmeny">
          {nav.map((item) => <NavButton key={item.id} active={view === item.id} item={item} onClick={() => { setView(item.id); setSelectedJob(null); }} />)}
        </nav>
        <div className="mt-auto rounded-2xl bg-accent p-4">
          <div className="mb-3 flex size-9 items-center justify-center rounded-full bg-card text-primary"><Sparkles /></div>
          <p className="text-sm font-bold">Något du behöver?</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Beskriv det med egna ord. Vi ordnar resten.</p>
          <Button className="mt-4 w-full" size="sm" onClick={openCreate}><Plus /> Lägg ut uppdrag</Button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/95 px-5 backdrop-blur lg:ml-60 lg:px-8">
        <div className="lg:hidden"><Brand /></div>
        <div className="hidden lg:block"><p className="text-sm text-muted-foreground">Stockholm</p><p className="font-bold">{me ? `Hej, ${me.display_name}!` : "Välkommen till Helpy"}</p></div>
        {user ? <Button variant="ghost" size="icon" aria-label="Aviseringar" onClick={() => setNoticeOpen(true)}><Bell /></Button> : <Button size="sm" variant="outline" onClick={() => navigate({ to: "/auth" })}>Logga in</Button>}
      </header>

      <main className="pb-24 lg:ml-60 lg:pb-0">
        {!STATIC_SITE && <p className="bg-accent px-5 py-2 text-center text-sm font-semibold">Testmiljö för betalningar – endast Stripe-sandlåda, inga riktiga pengar.</p>}
        <div className="mx-auto grid max-w-[1380px] lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0 px-5 py-6 sm:px-8 lg:px-10 lg:py-9">
            {selectedJob ? <JobDetail job={selectedJob} userId={user?.id} requireVerified={requireVerified} onBack={() => setSelectedJob(null)} onDone={() => { setSelectedJob(null); setView("activity"); }} />
              : view === "home" ? <HomeView jobs={jobs} loading={isLoading} onCreate={openCreate} onJob={setSelectedJob} onAll={() => setView("explore")} />
              : view === "explore" ? <ExploreView jobs={jobs} onJob={setSelectedJob} onCreate={openCreate} />
              : view === "activity" ? <ActivityView userId={user?.id} onLogin={() => navigate({ to: "/auth" })} />
              : <ProfileView userId={user?.id} onLogin={() => navigate({ to: "/auth" })} />}
          </section>
          <RightPanel jobs={jobs} onJob={setSelectedJob} />
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-card/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden" aria-label="Huvudmeny">
        {nav.map((item) => { const Icon = item.icon; const active = view === item.id; return <Button key={item.id} variant="ghost" className={`h-14 flex-col gap-1 rounded-xl px-1 text-[11px] ${active ? "text-primary" : "text-muted-foreground"}`} onClick={() => { setView(item.id); setSelectedJob(null); }}><Icon className="size-5" />{item.label}</Button>; })}
      </nav>
      {verifyOpen && <PhoneVerify onClose={() => setVerifyOpen(null)} onVerified={() => { const next = verifyOpen; setVerifyOpen(null); next(); }} />}
      {createOpen && user && <CreateFlow userId={user.id} onClose={() => setCreateOpen(false)} />}
      {noticeOpen && user && <Notifications userId={user.id} onClose={() => setNoticeOpen(false)} />}
    </div>
  );
}

function Brand() { return <div className="flex items-center gap-2.5"><div className="flex size-9 items-center justify-center rounded-xl bg-primary text-lg font-extrabold text-primary-foreground">H</div><span className="text-xl font-extrabold">Helpy</span></div>; }

function NavButton({ active, item, onClick }: { active: boolean; item: typeof nav[number]; onClick: () => void }) { const Icon = item.icon; return <Button variant="ghost" className={`w-full justify-start ${active ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`} onClick={onClick}><Icon />{item.label}</Button>; }

function HomeView({ jobs, loading, onCreate, onJob, onAll }: { jobs: Job[]; loading: boolean; onCreate: () => void; onJob: (job: Job) => void; onAll: () => void }) {
  return <div className="animate-soft-in">
    <div className="mb-7"><p className="mb-2 text-sm font-semibold text-primary">Hjälp finns runt hörnet</p><h1 className="max-w-xl text-3xl font-extrabold leading-tight sm:text-4xl">Vad behöver du hjälp med?</h1><p className="mt-3 text-muted-foreground">Beskriv det du behöver. Någon i närheten kan fixa det.</p></div>
    <Button size="lg" className="w-full sm:w-auto" onClick={onCreate}><Plus /> Lägg ut ett uppdrag</Button>
    <section className="mt-8"><h2 className="mb-4 text-lg font-bold">Populärt just nu</h2><div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0">{["⚡ Akut","🚗 Transport","🛒 Ärenden","🏠 Hem","📦 Hämtning","🔧 Småjobb","🐕 Djur"].map((c) => <Button key={c} variant="outline" className="shrink-0" onClick={onCreate}>{c}</Button>)}</div></section>
    <section className="mt-10"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-extrabold">Uppdrag nära dig</h2><p className="mt-1 text-sm text-muted-foreground">Stockholm</p></div><Button variant="ghost" size="sm" onClick={onAll}>Visa alla <ChevronRight /></Button></div>{loading ? <p className="text-sm text-muted-foreground">Laddar uppdrag…</p> : jobs.length ? <div className="grid gap-3 xl:grid-cols-2">{jobs.slice(0,4).map((job) => <JobCard key={job.id} job={job} onOpen={() => onJob(job)} />)}</div> : <EmptyState onCreate={onCreate} />}</section>
  </div>;
}

function JobCard({ job, onOpen }: { job: Job; onOpen: () => void }) { return <article onClick={onOpen} className="group cursor-pointer rounded-2xl border border-border bg-card p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 active:scale-[0.99]">
  <div className="flex items-start justify-between gap-4"><div><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase ${job.urgent ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"}`}>{job.emoji} {job.category}</span><h3 className="mt-3 text-lg font-extrabold">{job.title}</h3><p className="mt-1 text-sm text-muted-foreground">{job.detail}</p></div><strong className="shrink-0 text-xl">{job.price} kr</strong></div>
  <div className="mt-5 flex items-end justify-between gap-3 border-t border-border pt-4"><span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3.5" /> {job.location} · {job.timing}</span><Button size="sm" onClick={(e) => { e.stopPropagation(); onOpen(); }}>Hjälp till</Button></div>
 </article>; }

function ExploreView({ jobs, onJob, onCreate }: { jobs: Job[]; onJob: (job: Job) => void; onCreate: () => void }) { const [mode, setMode] = useState<"list" | "map">("list"); const [routeMode, setRouteMode] = useState(false); return <div className="animate-soft-in"><div className="flex items-start justify-between gap-3"><div><h1 className="text-3xl font-extrabold">Uppdrag nära dig</h1><p className="mt-2 text-muted-foreground">Hitta något som passar din tid och väg.</p></div><div className="flex rounded-xl border border-border bg-card p-1"><Button variant={mode === "list" ? "soft" : "ghost"} size="sm" onClick={() => setMode("list")}><ListFilter /> Lista</Button><Button variant={mode === "map" ? "soft" : "ghost"} size="sm" onClick={() => setMode("map")}><Map /> Karta</Button></div></div>
  <button onClick={() => setRouteMode(!routeMode)} className="mt-7 flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-primary/20 bg-accent p-5 text-left"><span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><RouteIcon /></span><span className="min-w-0 flex-1"><strong className="block">På vägen</strong><span className="mt-1 block text-sm text-muted-foreground">Tjäna extra på en resa du redan gör</span></span><ChevronRight className="text-primary" /></button>
  {routeMode && <div className="mt-3 animate-soft-in rounded-2xl border border-border bg-card p-5 shadow-card"><div className="flex items-center gap-3"><MapPin className="text-primary" /><div><p className="text-xs text-muted-foreground">Din rutt</p><p className="font-bold">Stockholm → Uppsala</p></div></div><div className="my-5 h-px bg-border" />{jobs.slice(0,3).map((j) => <button key={j.id} onClick={() => onJob(j)} className="flex w-full items-center gap-3 py-2 text-left"><span>{j.emoji}</span><span className="flex-1 text-sm font-semibold">{j.title}</span><strong className="text-sm text-success">+{payoutOf(j.price)} kr</strong></button>)}<Button className="mt-4 w-full"><Navigation /> Jag är på väg någonstans</Button></div>}
  <h2 className="sr-only">Alla uppdrag</h2>
  {mode === "map" ? <MapPanel tall jobs={jobs} onJob={onJob} /> : jobs.length ? <div className="mt-5 grid gap-3 xl:grid-cols-2">{jobs.map((job) => <JobCard key={job.id} job={job} onOpen={() => onJob(job)} />)}</div> : <div className="mt-5"><EmptyState onCreate={onCreate} /></div>}</div>; }

function LoginPrompt({ onLogin, text }: { onLogin: () => void; text: string }) { return <div className="rounded-2xl border border-dashed border-border py-12 text-center"><p className="font-bold">{text}</p><Button className="mt-5" onClick={onLogin}>Logga in</Button></div>; }

const PHONE_REQUIRED = false; // matchar public.phone_required() i databasen
const STATUS: Record<string, string> = { open: "Väntar på hjälpare", accepted: "Pågår", pending_approval: "Väntar på godkännande", completed: "Slutfört" };

function ActivityView({ userId, onLogin }: { userId?: string | undefined; onLogin: () => void }) {
  const [tab, setTab] = useState<"need" | "help">("need");
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["my-jobs", userId, tab], enabled: !!userId, queryFn: async () => { const { data, error } = await supabase.from("jobs").select("*").eq(tab === "need" ? "requester_id" : "helper_id", userId!).order("created_at", { ascending: false }); if (error) throw error; return withProfiles(data); } });
  if (!userId) return <div className="animate-soft-in"><h1 className="mb-6 text-3xl font-extrabold">Aktivitet</h1><LoginPrompt onLogin={onLogin} text="Logga in för att se dina uppdrag." /></div>;
  const setStatus = async (job: Job, from: string, to: string) => { const { error } = await supabase.from("jobs").update({ status: to }).eq("id", job.id).eq("status", from); if (error) alert("Det gick inte att uppdatera uppdraget."); qc.invalidateQueries(); };
  const approve = async (job: Job) => { try { if (STATIC_SITE) { await setStatus(job, "pending_approval", "completed"); } else { await paymentAction("approve", job.id); } qc.invalidateQueries(); } catch (e) { alert(e instanceof Error ? e.message : "Godkännandet misslyckades."); } };
  const review = async (job: Job, rating: number) => { await supabase.from("reviews").insert({ job_id: job.id, reviewer_id: userId, reviewee_id: tab === "need" ? job.helper_id! : job.requester_id, rating }); qc.invalidateQueries(); };
  const active = data.filter((j) => j.status !== "completed"), done = data.filter((j) => j.status === "completed");
  return <div className="animate-soft-in"><h1 className="text-3xl font-extrabold">Aktivitet</h1><div className="mt-6 grid grid-cols-2 rounded-xl bg-secondary p-1"><Button variant={tab === "need" ? "outline" : "ghost"} onClick={() => setTab("need")}>Jag behöver hjälp</Button><Button variant={tab === "help" ? "outline" : "ghost"} onClick={() => setTab("help")}>Jag hjälper</Button></div>
    <div className="mt-8 space-y-7"><ActivityGroup label="Aktivt">{active.length ? active.map((j) => <ActivityCard key={j.id} job={j} price={tab === "need" ? j.price : payoutOf(j.price)} action={<>{STATIC_SITE ? <p className="mb-2 text-xs text-muted-foreground">Ingen kortbetalning sker i den här versionen.</p> : <PaymentControls job={j} userId={userId} />}{tab === "help" && j.status === "accepted" ? <Button size="sm" onClick={() => setStatus(j, "accepted", "pending_approval")}>Jag är klar</Button> : tab === "need" && j.status === "pending_approval" ? <Button size="sm" onClick={() => approve(j)}>Godkänn och avsluta</Button> : null}</>} />) : <p className="text-sm text-muted-foreground">Inga aktiva uppdrag.</p>}</ActivityGroup>
    <ActivityGroup label="Slutfört">{done.length ? done.map((j) => <ActivityCard key={j.id} job={j} price={tab === "need" ? j.price : payoutOf(j.price)} action={<span className="flex">{[1,2,3,4,5].map((n) => <button key={n} aria-label={`${n} stjärnor`} onClick={() => review(j, n)} className="text-primary">★</button>)}</span>} />) : <p className="text-sm text-muted-foreground">Inga slutförda uppdrag än.</p>}</ActivityGroup></div></div>;
}
function ActivityGroup({ label, children }: { label: string; children: React.ReactNode }) { return <section><h2 className="mb-3 text-xs font-extrabold uppercase text-muted-foreground">{label}</h2><div className="space-y-3">{children}</div></section>; }
function ActivityCard({ job, price, action }: { job: Job; price: number; action?: React.ReactNode }) { const done = job.status === "completed"; return <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-card"><span className="flex size-12 items-center justify-center rounded-xl bg-secondary text-xl">{job.emoji}</span><div className="min-w-0 flex-1"><h3 className="font-bold">{job.title}</h3><p className={`mt-1 flex items-center gap-1 text-sm ${done ? "text-success" : "text-muted-foreground"}`}>{done && <Check className="size-4" />}{STATUS[job.status]}</p>{action && <div className="mt-2">{action}</div>}</div><strong>{price} kr</strong></div>; }

function ProfileView({ userId, onLogin }: { userId?: string | undefined; onLogin: () => void }) {
  const qc = useQueryClient();
  const [historyOpen, setHistoryOpen] = useState(false);
  const { data } = useQuery({ queryKey: ["profile-full", userId], enabled: !!userId, queryFn: async () => {
    const [p, r, h] = await Promise.all([
      supabase.from("profiles").select("id, display_name, avatar_url").eq("id", userId!).maybeSingle(),
      supabase.from("reviews").select("*").eq("reviewee_id", userId!).order("created_at", { ascending: false }),
      supabase.from("jobs").select("*").eq("helper_id", userId!).eq("status", "completed").order("created_at", { ascending: false }),
    ]);
    return { profile: p.data, reviews: r.data ?? [], helped: await withProfiles(h.data ?? []) };
  } });
  if (!userId) return <div className="animate-soft-in"><h1 className="mb-6 text-3xl font-extrabold">Profil</h1><LoginPrompt onLogin={onLogin} text="Logga in för att se din profil." /></div>;
  if (!data) return <p className="text-sm text-muted-foreground">Laddar…</p>;
  const avg = data.reviews.length ? (data.reviews.reduce((s, r) => s + r.rating, 0) / data.reviews.length).toFixed(1) : "–";
  const total = data.helped.reduce((s, j) => s + payoutOf(j.price), 0);
  const rename = async () => { const n = prompt("Ditt namn", data.profile?.display_name); if (n?.trim()) { await supabase.from("profiles").update({ display_name: n.trim() }).eq("id", userId); qc.invalidateQueries(); } };
  const signOut = async () => { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); };
  return <div className="animate-soft-in"><h1 className="text-3xl font-extrabold">Profil</h1><div className="mt-7 flex items-center gap-5"><Avatar p={data.profile} size="size-24" /><div><h2 className="text-2xl font-extrabold">{data.profile?.display_name}</h2><p className="mt-1 flex items-center gap-1 font-bold"><Star className="size-4 fill-current text-primary" /> {avg} <span className="font-normal text-muted-foreground">· {data.helped.length} uppdrag</span></p><Button variant="ghost" size="sm" className="-ml-3 mt-1" onClick={rename}>Ändra namn</Button></div></div>
    <div className="mt-8 grid gap-3 sm:grid-cols-3"><div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm font-semibold"><ShieldCheck className="text-success" />E-post verifierad</div><PhoneBadge />{!STATIC_SITE && <StripeConnectButton />}<Button variant="outline" className="h-auto justify-start p-4" onClick={() => setHistoryOpen(!historyOpen)}><CreditCard className="text-success" />Ersättningshistorik<ChevronRight className={`ml-auto transition-transform ${historyOpen ? "rotate-90" : ""}`} /></Button></div>
    {historyOpen && <section className="mt-6 animate-soft-in"><div className="flex items-end justify-between"><div><h2 className="text-xl font-extrabold">Ersättning för utförda jobb</h2><p className="mt-1 text-sm text-muted-foreground">Jobb du har utfört</p></div><strong className="text-success">{total} kr totalt</strong></div><div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">{data.helped.length ? data.helped.map((j, i) => <div key={j.id} className={`flex items-center gap-4 p-4 ${i ? "border-t border-border" : ""}`}><span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-lg">{j.emoji}</span><div className="min-w-0 flex-1"><p className="font-bold">{j.title}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(j.created_at).toLocaleDateString("sv-SE")}</p></div><strong className="text-success">+{payoutOf(j.price)} kr</strong></div>) : <p className="p-4 text-sm text-muted-foreground">Inga utförda jobb än.</p>}</div></section>}
    <section className="mt-9"><h2 className="text-xl font-extrabold">Omdömen</h2><div className="mt-4 space-y-3">{data.reviews.length ? data.reviews.map((r) => <div key={r.id} className="rounded-2xl border border-border bg-card p-5"><div className="text-sm text-primary">{"★".repeat(r.rating)}</div>{r.comment && <p className="mt-2 font-semibold">“{r.comment}”</p>}</div>) : <p className="text-sm text-muted-foreground">Inga omdömen än.</p>}</div></section>
    <Button variant="outline" className="mt-9" onClick={signOut}>Logga ut</Button></div>;
}

function JobDetail({ job, userId, requireVerified, onBack, onDone }: { job: Job; userId?: string | undefined; requireVerified: (next: () => void) => void; onBack: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false); const [accepted, setAccepted] = useState(false); const [err, setErr] = useState<string | null>(null);
  const own = userId === job.requester_id;
  const accept = async () => { try { if (!STATIC_SITE) await paymentAction<{ ready: boolean }>("account-status").then((r) => { if (!r.ready) throw new Error("Anslut ditt Stripe-konto under Profil först."); }); } catch (e) { setErr(e instanceof Error ? e.message : "Kontrollera ditt Stripe-konto."); return; } const { data, error } = await supabase.from("jobs").update({ helper_id: userId!, status: "accepted" }).eq("id", job.id).eq("status", "open").select(); if (error || !data?.length) { setErr("Uppdraget är redan taget."); return; } qc.invalidateQueries(); setAccepted(true); };
  if (accepted) return <div className="mx-auto max-w-lg py-10 text-center animate-soft-in"><div className="mx-auto flex size-20 animate-check-pop items-center justify-center rounded-full bg-success-soft text-success"><Check className="size-10" /></div><h1 className="mt-6 text-3xl font-extrabold">Uppdraget är ditt!</h1><p className="mt-3 text-muted-foreground">{job.requester?.display_name ?? "Beställaren"} ser nu att du hjälper till.</p><Button className="mt-7" onClick={onDone}>Till mina uppdrag</Button></div>;
  return <div className="mx-auto max-w-2xl animate-soft-in"><Button variant="ghost" className="-ml-3 mb-5" onClick={onBack}><ChevronLeft /> Tillbaka</Button><div className="flex size-16 items-center justify-center rounded-2xl bg-accent text-3xl">{job.emoji}</div><div className="mt-5 flex items-start justify-between gap-4"><div><span className="text-xs font-extrabold uppercase text-primary">{job.category}</span><h1 className="mt-1 text-3xl font-extrabold">{job.title}</h1></div><strong className="text-2xl">{job.price} kr</strong></div><p className="mt-5 text-base leading-relaxed text-muted-foreground">{job.detail}</p><div className="mt-7 h-52 overflow-hidden rounded-2xl border border-border"><MapPanel compact jobs={[job]} /></div><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground"><span className="flex items-center gap-1"><MapPin className="size-4" /> {job.location}</span><span className="flex items-center gap-1"><Clock3 className="size-4" /> Publicerad för {timeAgo(job.created_at)}</span></div><div className="my-8 h-px bg-border" /><div className="flex items-center gap-4"><Avatar p={job.requester} /><div><p className="font-extrabold">{job.requester?.display_name ?? "Användare"}</p><p className="mt-1 flex items-center gap-1 text-xs font-semibold text-success"><ShieldCheck className="size-4" /> Verifierat konto</p></div></div>
    {own ? <p className="mt-8 rounded-xl bg-secondary p-4 text-center text-sm font-semibold">Det här är ditt uppdrag.</p> : <Button size="lg" className="mt-8 w-full" onClick={() => requireVerified(() => setConfirm(true))}>Jag kan hjälpa</Button>}
    {confirm && <Modal onClose={() => setConfirm(false)}><div className="text-center"><div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent text-primary"><WalletCards /></div><h2 className="mt-5 text-2xl font-extrabold">Vill du ta detta uppdrag?</h2><p className="mt-2 text-sm text-muted-foreground">{STATIC_SITE ? "Ingen kortbetalning sker i den här versionen." : "Börja först när beställarens kortreservation är bekräftad. Du ser betalningsstatus under Aktivitet."}</p></div><PriceRows price={job.price} />{err && <p className="mt-4 text-center text-sm text-destructive">{err}</p>}<Button size="lg" className="mt-6 w-full" onClick={accept}>Acceptera uppdrag</Button></Modal>}</div>;
}

function PriceRows({ price }: { price: number }) { return <div className="mt-6 rounded-xl bg-secondary p-4"><div className="flex items-center justify-between"><span className="font-semibold">Du behåller</span><strong className="text-2xl text-success">{payoutOf(price)} kr</strong></div><p className="mt-4 flex gap-2 border-t border-border pt-4 text-left text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-success" /> {STATIC_SITE ? "Beloppet är ett ersättningsförslag. Ingen betalning hanteras i den här versionen." : "Beställaren reserverar beloppet efter accept. Vid godkännande debiteras kortet och ersättningen överförs till ditt Stripe-konto."}</p></div>; }

function CreateFlow({ userId, onClose }: { userId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1); const [text, setText] = useState(""); const [price, setPrice] = useState(""); const [when, setWhen] = useState("Nu"); const [location, setLocation] = useState("Stockholm"); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  const g = guessJob(text);
  const canContinue = step !== 1 || text.trim().length > 4;
  const publish = async () => { const amount = Number(price) || g.suggested; if (!Number.isSafeInteger(amount) || amount < 10 || amount > 100000) { alert("Priset måste vara 10–100 000 kr."); return; } setBusy(true); const { error } = await supabase.from("jobs").insert({ requester_id: userId, category: g.category, title: g.title, detail: text.trim(), price: Number(price) || g.suggested, location, timing: when }); setBusy(false); if (!error) { qc.invalidateQueries(); setDone(true); } };
  if (done) return <Modal onClose={onClose}><div className="py-7 text-center"><div className="mx-auto flex size-20 animate-check-pop items-center justify-center rounded-full bg-success-soft text-success"><Check className="size-10" /></div><h2 className="mt-6 text-2xl font-extrabold">Ditt uppdrag är publicerat!</h2><p className="mt-3 text-sm text-muted-foreground">Du ser det under Aktivitet.</p><Button className="mt-7 w-full" onClick={onClose}>Klart</Button></div></Modal>;
  return <Modal onClose={onClose} wide><div className="mb-7"><div className="flex items-center text-xs font-bold text-muted-foreground"><span>Steg {step} av 5</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${step * 20}%` }} /></div></div>
    <div className="min-h-[310px] animate-soft-in" key={step}>{step === 1 ? <><p className="text-sm font-semibold text-primary">Berätta med egna ord</p><h2 className="mt-2 text-2xl font-extrabold">Vad behöver du hjälp med?</h2><textarea autoFocus aria-label="Beskriv vad du behöver hjälp med" value={text} onChange={(e) => setText(e.target.value)} placeholder="Exempel: Kan någon hämta mitt paket?" className="mt-6 min-h-36 w-full resize-none rounded-2xl border border-input bg-card p-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />{text.length > 8 && <div className="mt-4 flex gap-3 rounded-xl bg-accent p-4"><Sparkles className="shrink-0 text-primary" /><div><p className="text-xs font-bold text-primary">Automatiskt förslag</p><p className="mt-1 font-bold">{EMOJI[g.category]} {g.category} · {g.title}</p></div></div>}</>
    : step === 2 ? <><p className="text-sm font-semibold text-primary">Ersättning</p><h2 className="mt-2 text-2xl font-extrabold">Vad vill du betala?</h2><div className="mt-8 flex items-baseline justify-center gap-2"><input value={price} placeholder={String(g.suggested)} onChange={(e) => setPrice(e.target.value.replace(/\D/g,""))} className="w-32 bg-transparent text-right text-5xl font-extrabold outline-none" inputMode="numeric" aria-label="Pris" /><span className="text-2xl font-bold">kr</span></div><p className="mt-5 text-center text-sm text-muted-foreground">Förslag: <strong className="text-foreground">{g.suggested} kr</strong></p><p className="mt-6 flex justify-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-success" /> {STATIC_SITE ? "Ingen betalning hanteras i den här versionen." : "Beloppet reserveras på ditt kort efter accept. Kortet debiteras när du godkänner jobbet."}</p></>
    : step === 3 ? <><p className="text-sm font-semibold text-primary">Tid</p><h2 className="mt-2 text-2xl font-extrabold">När behöver du hjälp?</h2><div className="mt-7 grid grid-cols-2 gap-3">{["Nu","Idag","Imorgon","I veckan"].map((x) => <Button key={x} variant={when === x ? "default" : "outline"} className="h-16" onClick={() => setWhen(x)}>{x}</Button>)}</div></>
    : step === 4 ? <><p className="text-sm font-semibold text-primary">Plats</p><h2 className="mt-2 text-2xl font-extrabold">Var?</h2><div className="mt-6 h-40 overflow-hidden rounded-2xl border border-border"><MapPanel compact jobs={[]} /></div><div className="mt-4 flex items-center gap-3 rounded-xl border border-border p-4"><MapPin className="text-primary" /><input value={location} onChange={(e) => setLocation(e.target.value)} className="flex-1 bg-transparent font-bold outline-none" aria-label="Plats" /></div></>
    : <><p className="text-sm font-semibold text-primary">Förhandsvisning</p><h2 className="mt-2 text-2xl font-extrabold">Så här ser ditt uppdrag ut</h2><div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card"><span className="rounded-full bg-accent px-2.5 py-1 text-xs font-extrabold uppercase text-accent-foreground">{EMOJI[g.category]} {g.category}</span><div className="mt-4 flex justify-between gap-4"><div><h3 className="text-xl font-extrabold">{g.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p></div><strong className="shrink-0 text-xl">{Number(price) || g.suggested} kr</strong></div><p className="mt-5 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3.5" /> {location} · {when}</p></div></>}</div>
    <div className="mt-7 flex gap-3">{step > 1 && <Button variant="outline" size="lg" onClick={() => setStep(step - 1)}><ChevronLeft /> Tillbaka</Button>}<Button size="lg" className="flex-1" disabled={!canContinue || busy} onClick={() => step < 5 ? setStep(step + 1) : publish()}>{step === 5 ? "Publicera uppdrag" : "Fortsätt"}{step < 5 && <ChevronRight />}</Button></div></Modal>;
}

function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) { return <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true"><div className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-background p-6 shadow-card sm:rounded-3xl sm:p-8 ${wide ? "sm:max-w-xl" : "sm:max-w-md"}`}><Button variant="ghost" size="icon" className="absolute right-4 top-4 z-10" onClick={onClose} aria-label="Stäng"><X /></Button>{children}</div></div>; }

function Notifications({ userId, onClose }: { userId: string; onClose: () => void }) { const { data = [] } = useQuery({ queryKey: ["notices", userId], queryFn: async () => withProfiles((await supabase.from("jobs").select("*").eq("requester_id", userId).neq("status", "open").order("created_at", { ascending: false })).data ?? []) }); return <Modal onClose={onClose}><h2 className="pr-12 text-2xl font-extrabold">Aviseringar</h2><div className="mt-6 space-y-1">{data.length ? data.map((j) => <div key={j.id} className="flex gap-3 rounded-xl p-3"><span className="text-xl">{j.status === "completed" ? "✓" : "🎉"}</span><div><p className="text-sm font-bold">{j.status === "completed" ? "Uppdraget är klart" : "Någon vill hjälpa dig!"}</p><p className="mt-1 text-xs text-muted-foreground">{j.title}</p></div></div>) : <p className="text-sm text-muted-foreground">Inga aviseringar än.</p>}</div></Modal>; }

function EmptyState({ onCreate }: { onCreate: () => void }) { return <div className="rounded-2xl border border-dashed border-border py-12 text-center"><div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary"><Search /></div><p className="mt-4 font-bold">Det finns inga uppdrag nära dig just nu.</p><p className="mt-1 text-sm text-muted-foreground">Var först med att lägga ut ett.</p><Button className="mt-5" onClick={onCreate}><Plus /> Lägg ut uppdrag</Button></div>; }

function RightPanel({ jobs, onJob }: { jobs: Job[]; onJob: (job: Job) => void }) { return <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] border-l border-border bg-card p-6 lg:block"><div className="flex items-center justify-between"><div><h2 className="font-extrabold">Nära dig</h2><p className="text-xs text-muted-foreground">Stockholm · 5 km</p></div><Button variant="ghost" size="icon" aria-label="Filtrera"><ListFilter /></Button></div><div className="mt-4 h-[48%] overflow-hidden rounded-2xl border border-border"><MapPanel compact jobs={jobs} onJob={onJob} /></div><h3 className="mt-6 text-xs font-extrabold uppercase text-muted-foreground">Senast publicerat</h3><div className="mt-3 space-y-2">{jobs.slice(0,2).map((j) => <button key={j.id} onClick={() => onJob(j)} className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-left transition hover:bg-secondary"><span className="flex size-10 items-center justify-center rounded-xl bg-secondary">{j.emoji}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{j.title}</strong><span className="text-xs text-muted-foreground">{j.location}</span></span><strong className="text-sm">{j.price} kr</strong></button>)}</div></aside>; }

function MapPanel({ tall, compact, jobs, onJob }: { tall?: boolean; compact?: boolean; jobs: Job[]; onJob?: (job: Job) => void }) { const markers = jobs.slice(0,3); return <div className={`relative w-full overflow-hidden bg-secondary ${tall ? "mt-5 h-[520px] rounded-2xl border border-border" : "h-full"}`}><div className="absolute inset-0 opacity-60" style={{ backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)", backgroundSize: compact ? "34px 34px" : "52px 52px", transform: "rotate(-8deg) scale(1.2)" }} /><div className="absolute left-[18%] top-[35%] h-2 w-[75%] rotate-12 rounded-full bg-card shadow-card" /><div className="absolute left-[45%] top-[12%] h-[80%] w-2 -rotate-12 rounded-full bg-card shadow-card" />{markers.map((m,i) => <button key={m.id} aria-label={m.title} onClick={() => onJob?.(m)} className={`absolute flex cursor-pointer items-center gap-1 rounded-full border-2 border-card bg-primary px-2.5 py-1.5 text-xs font-extrabold text-primary-foreground shadow-action transition-transform hover:scale-105 ${i === 0 ? "left-[20%] top-[28%]" : i === 1 ? "right-[18%] top-[48%]" : "bottom-[18%] left-[42%]"}`}>{m.emoji} {m.price}</button>)}<div className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[5px] border-card bg-success shadow-card" /></div>; }
function PhoneBadge() { const { user } = useSession(); const [open, setOpen] = useState(false); if (user?.phone_confirmed_at) return <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm font-semibold"><Smartphone className="text-success" />Telefonnummer verifierat</div>; return <><Button variant="outline" className="h-auto justify-start p-4" onClick={() => setOpen(true)}><Smartphone className="text-primary" />Verifiera telefonnummer<ChevronRight className="ml-auto" /></Button>{open && <PhoneVerify onClose={() => setOpen(false)} onVerified={() => setOpen(false)} />}</>; }

function StripeConnectButton() {
  const [busy, setBusy] = useState(false);
  const connect = async () => { setBusy(true); try { const { url } = await paymentAction("connect"); window.location.assign(url); } catch (e) { alert(e instanceof Error ? e.message : "Kunde inte ansluta Stripe."); } finally { setBusy(false); } };
  return <Button variant="outline" className="h-auto justify-start p-4" disabled={busy} onClick={connect}><WalletCards />{busy ? "Öppnar Stripe…" : "Anslut / uppdatera utbetalningskonto"}</Button>;
}
function PaymentControls({ job, userId }: { job: Job; userId: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data, error, isLoading } = useQuery({ queryKey: ["payment", job.id], queryFn: () => paymentAction<{ authorized: boolean; paid: boolean; transferred: boolean; blocked: boolean }>("status", job.id), refetchInterval: 15000 });
  const pay = async () => { setBusy(true); try { const { url } = await paymentAction("checkout", job.id); window.location.assign(url); } catch (e) { alert(e instanceof Error ? e.message : "Betalningen misslyckades."); qc.invalidateQueries({ queryKey: ["payment", job.id] }); } finally { setBusy(false); } };
  return <div className="mb-2 space-y-2 text-xs"><p>{isLoading ? "Kontrollerar betalning…" : error ? "Betalningsstatus kunde inte hämtas. Börja inte arbeta innan betalningen bekräftats." : data?.blocked ? "Betalning spärrad – kontakta Helpy." : data?.transferred ? "Ersättning överförd till Stripe-kontot. Bankutbetalning sker enligt Stripes schema." : (data?.authorized || data?.paid) ? "Kortreservation bekräftad – uppdraget kan utföras." : "Väntar på beställarens betalning."}</p>{job.requester_id === userId && job.status === "accepted" && data && !data.paid && !data.authorized && !data.blocked && <Button size="sm" disabled={busy} onClick={pay}>{busy ? "Öppnar…" : `Reservera ${job.price} kr på kort`}</Button>}</div>;
}
