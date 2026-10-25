import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Logga in — Helpy" },
      { name: "description", content: "Logga in eller skapa ett konto på Helpy för att lägga ut och ta uppdrag." },
      { property: "og:title", content: "Logga in — Helpy" },
      { property: "og:description", content: "Skapa ett konto och få hjälp av någon i närheten." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === "up") {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).href, data: { display_name: name.trim() || undefined } },
      });
      setMsg(error ? error.message : "Kolla din e-post och klicka på länken för att bekräfta kontot.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg("Fel e-post eller lösenord.");
      else navigate({ to: "/" });
    }
    setBusy(false);
  }

  const input = "w-full rounded-xl border border-input bg-card px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10";
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-5">
      <form onSubmit={submit} className="w-full max-w-sm animate-soft-in rounded-3xl border border-border bg-card p-7 shadow-card">
        <div className="flex items-center gap-2.5"><div className="flex size-9 items-center justify-center rounded-xl bg-primary text-lg font-extrabold text-primary-foreground">H</div><span className="text-xl font-extrabold">Helpy</span></div>
        <h1 className="mt-6 text-2xl font-extrabold">{mode === "in" ? "Välkommen tillbaka" : "Skapa konto"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{mode === "in" ? "Logga in för att lägga ut och ta uppdrag." : "Det tar mindre än en minut."}</p>
        <div className="mt-6 space-y-3">
          {mode === "up" && <input className={input} aria-label="Ditt namn" placeholder="Ditt namn" value={name} onChange={(e) => setName(e.target.value)} required />}
          <input className={input} type="email" aria-label="E-post" placeholder="E-post" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className={input} type="password" aria-label="Lösenord" placeholder="Lösenord (minst 6 tecken)" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {msg && <p className="mt-4 rounded-xl bg-secondary p-3 text-sm">{msg}</p>}
        <Button size="lg" className="mt-6 w-full" disabled={busy}>{mode === "in" ? "Logga in" : "Skapa konto"}</Button>
        <button type="button" className="mt-4 w-full text-sm text-muted-foreground" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }}>
          {mode === "in" ? "Ny här? Skapa ett konto" : "Har du redan ett konto? Logga in"}
        </button>
      </form>
    </div>
  );
}
