// Pure helpers shared by the server and Node tests. All amounts are integer öre.
export function amounts(price) {
  if (!Number.isSafeInteger(price) || price < 10 || price > 100000) throw new Error("Priset måste vara 10–100 000 kr.");
  const total = price * 100;
  // Keep the existing whole-krona helper compensation visible in the app.
  const helper = Math.round(price * 0.85) * 100;
  return { total, helper, fee: total - helper };
}
export async function verifySignature(body, header, secret, now = Date.now()) {
  const parts = (header ?? "").split(",").map(x => x.split("="));
  const t = parts.find(x => x[0] === "t")?.[1];
  if (!t || !/^\d+$/.test(t) || Math.abs(now / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`)));
  return parts.filter(x => x[0] === "v1").some(([, sig]) => {
    if (!sig || !/^[a-f0-9]{64}$/.test(sig)) return false;
    let diff = 0;
    for (let i = 0; i < mac.length; i++) diff |= mac[i] ^ parseInt(sig.slice(i * 2, i * 2 + 2), 16);
    return diff === 0;
  });
}
