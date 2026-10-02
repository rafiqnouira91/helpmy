import { useState } from "react";
import { Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

function toE164(raw: string) {
  const d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d;
  if (d.startsWith("00")) return "+" + d.slice(2);
  if (d.startsWith("0")) return "+46" + d.slice(1);
  return "+46" + d;
}

export function PhoneVerify({ onClose, onVerified }: { onClose: () => void; onVerified: () => void }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.updateUser({ phone: toE164(phone) });
    setBusy(false);
    if (error) setErr("Vi kunde inte skicka sms just nu. Kontrollera numret och försök igen.");
    else setStep("code");
  };
  const verify = async () => {
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.verifyOtp({ phone: toE164(phone), token: code, type: "phone_change" });
    setBusy(false);
    if (error) setErr("Fel kod. Försök igen.");
    else { await supabase.auth.refreshSession(); onVerified(); }
  };

  const input = "w-full rounded-xl border border-input bg-card px-4 py-3 text-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/10";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true">
      <div className="relative w-full rounded-t-3xl bg-background p-6 shadow-card animate-soft-in sm:max-w-md sm:rounded-3xl sm:p-8">
        <Button variant="ghost" size="icon" className="absolute right-4 top-4" onClick={onClose} aria-label="Stäng"><X /></Button>
        <div className="flex size-14 items-center justify-center rounded-2xl bg-accent text-primary"><Smartphone /></div>
        <h2 className="mt-5 text-2xl font-extrabold">{step === "phone" ? "Verifiera ditt telefonnummer" : "Ange koden"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {step === "phone" ? "För allas trygghet behöver du ett verifierat nummer innan du lägger ut eller tar uppdrag." : `Vi har skickat en 6-siffrig kod till ${toE164(phone)}.`}
        </p>
        <div className="mt-6">
          {step === "phone"
            ? <input className={input} type="tel" inputMode="tel" placeholder="070 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
            : <input className={`${input} text-center tracking-[0.5em]`} inputMode="numeric" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />}
        </div>
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
        {step === "phone"
          ? <Button size="lg" className="mt-6 w-full" disabled={busy || phone.replace(/\D/g, "").length < 8} onClick={send}>Skicka kod</Button>
          : <>
              <Button size="lg" className="mt-6 w-full" disabled={busy || code.length !== 6} onClick={verify}>Verifiera</Button>
              <button className="mt-4 w-full text-sm text-muted-foreground" onClick={() => { setStep("phone"); setCode(""); }}>Byt nummer eller skicka igen</button>
            </>}
      </div>
    </div>
  );
}
