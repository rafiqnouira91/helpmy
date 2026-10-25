import { amounts, verifySignature } from './stripe-core.mjs';

type Job = { id: string; requester_id: string; helper_id: string | null; status: string; price: number; title: string };
type Payment = { job_id: string; requester_id: string; helper_id: string; account_id: string; amount: number; helper_amount: number; checkout_started_at: string; checkout_id: string | null; payment_intent_id: string | null; charge_id: string | null; paid_at: string | null; transfer_id: string | null; blocked: boolean };
type Account = { user_id: string; account_id: string };
type StripeAccount = { id: string; payouts_enabled: boolean; capabilities?: { transfers?: string } };
type Session = { id: string; url: string | null; status: string; payment_status: string; payment_intent: string | null; amount_total: number; currency: string; metadata: { job_id?: string } };
type Charge = { id: string; amount: number; amount_refunded: number; disputed: boolean; paid: boolean; currency: string };
class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
function env(name: string) { const value = process.env[name]; if (!value) throw new ApiError(503, `Serverinställningen ${name} saknas.`); return value; }
function origin() { const url = new URL(env('APP_URL')); if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new ApiError(503, 'APP_URL måste använda HTTPS.'); return url.origin; }
function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } }); }
async function stripe<T>(path: string, fields?: Record<string, string>, key?: string): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: fields ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`, 'Stripe-Version': '2024-06-20', ...(fields ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(fields ? { body: new URLSearchParams(fields) } : {}),
  });
  if (!response.ok) throw new ApiError(502, 'Stripe kunde inte slutföra åtgärden. Kontrollera Stripe-loggarna och försök igen.');
  return response.json() as Promise<T>;
}
async function db<T>(path: string, method = 'GET', body?: unknown, prefer?: string): Promise<T> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, {
    method, headers: { apikey: key, ...(!key.startsWith('sb_secret_') ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json', Prefer: prefer ?? 'return=representation' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new ApiError(502, 'Databasåtgärden misslyckades. Kontrollera betalningsmigreringen och serverinställningarna.');
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
async function authenticate(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new ApiError(401, 'Logga in först.');
  const response = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, { headers: { apikey: env('SUPABASE_PUBLISHABLE_KEY'), Authorization: authorization } });
  if (!response.ok) throw new ApiError(401, 'Logga in igen.');
  const user = await response.json() as { id: string };
  if (!user.id) throw new ApiError(401, 'Ogiltigt konto.');
  return user;
}
async function getJob(id: unknown) {
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) throw new ApiError(400, 'Ogiltigt uppdrag.');
  const [job] = await db<Job[]>(`jobs?id=eq.${id}&select=id,requester_id,helper_id,status,price,title`);
  if (!job) throw new ApiError(404, 'Uppdraget finns inte.');
  return job;
}
async function accountFor(userId: string) { return (await db<Account[]>(`stripe_accounts?user_id=eq.${userId}`))[0]; }
async function readyAccount(id: string) {
  const a = await stripe<StripeAccount>(`accounts/${encodeURIComponent(id)}`);
  if (!a.payouts_enabled || a.capabilities?.transfers !== 'active') throw new ApiError(409, 'Hjälparen måste slutföra sina Stripe-kontouppgifter först.');
  return a;
}
async function paymentFor(jobId: string) { return (await db<Payment[]>(`job_payments?job_id=eq.${jobId}`))[0]; }
async function markPaid(session: Session) {
  const jobId = session.metadata?.job_id;
  if (!jobId || !/^[a-f0-9-]{36}$/i.test(jobId)) return;
  const p = await paymentFor(jobId);
  if (p && !p.checkout_id) throw new ApiError(503, "Betalningssessionen sparas fortfarande. Stripe ska försöka igen.");
  if (!p || p.checkout_id !== session.id || p.amount !== session.amount_total || session.currency !== 'sek' || session.payment_status !== 'paid' || !session.payment_intent) return;
  const intent = await stripe<{ latest_charge: string }>(`payment_intents/${encodeURIComponent(session.payment_intent)}`);
  if (!intent.latest_charge) throw new ApiError(502, 'Stripe saknar debitering.');
  await db(`job_payments?job_id=eq.${jobId}`, 'PATCH', { payment_intent_id: session.payment_intent, charge_id: intent.latest_charge, paid_at: new Date().toISOString() });
}
async function webhook(request: Request) {
  const raw = await request.text();
  if (!await verifySignature(raw, request.headers.get('stripe-signature'), env('STRIPE_WEBHOOK_SECRET'))) throw new ApiError(400, 'Ogiltig Stripe-signatur.');
  const event = JSON.parse(raw) as { type: string; data: { object: Session & { payment_intent?: string; charge?: string; id: string } } };
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') await markPaid(event.data.object);
  // Never clear blocked through a later event: refunds and disputes need reconciliation.
  if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
    const chargeId = event.type === 'charge.refunded' ? event.data.object.id : event.data.object.charge;
    if (chargeId && /^ch_[A-Za-z0-9]+$/.test(chargeId)) await db(`job_payments?charge_id=eq.${chargeId}`, 'PATCH', { blocked: true });
  }
  return json({ received: true });
}
export async function handleStripeRequest(request: Request): Promise<Response> {
  try {
    const action = new URL(request.url).pathname.replace('/api/stripe/', '');
    if (request.method !== 'POST') return json({ error: 'Använd POST.' }, 405);
    if (action === 'webhook') return await webhook(request);
    // Bearer auth plus origin check. Webhooks use signatures instead.
    if (request.headers.get('Origin') !== origin()) throw new ApiError(403, 'Ogiltigt ursprung.');
    const user = await authenticate(request);
    if (action === 'connect') {
      let account = await accountFor(user.id);
      if (!account) {
        const created = await stripe<StripeAccount>('accounts', { type: 'express', country: 'SE', 'capabilities[transfers][requested]': 'true', 'metadata[helpy_user_id]': user.id }, `helpy-account-${user.id}`);
        await db('stripe_accounts?on_conflict=user_id', 'POST', { user_id: user.id, account_id: created.id }, 'resolution=ignore-duplicates,return=representation');
        account = await accountFor(user.id);
      }
      if (!account) throw new ApiError(502, 'Kunde inte spara Stripe-kontot.');
      const link = await stripe<{ url: string }>('account_links', { account: account.account_id, type: 'account_onboarding', refresh_url: `${origin()}/?stripe=connect-retry`, return_url: `${origin()}/?stripe=connect-return` });
      return json({ url: link.url });
    }
    if (action === 'account-status') {
      const a = await accountFor(user.id);
      if (!a) return json({ ready: false });
      await readyAccount(a.account_id);
      return json({ ready: true });
    }
    const body = await request.json() as { jobId?: unknown };
    const job = await getJob(body.jobId);
    if (user.id !== job.requester_id && user.id !== job.helper_id) throw new ApiError(403, 'Du deltar inte i uppdraget.');
    if (action === 'status') {
      let p = await paymentFor(job.id);
      // Reconcile on return too; never trust the success URL itself as payment evidence.
      if (p?.checkout_id && !p.paid_at) {
        await markPaid(await stripe<Session>(`checkout/sessions/${encodeURIComponent(p.checkout_id)}`));
        p = await paymentFor(job.id);
      }
      return json({ paid: !!p?.paid_at, transferred: !!p?.transfer_id, blocked: p?.blocked ?? false });
    }
    if (job.requester_id !== user.id) throw new ApiError(403, 'Bara beställaren får betala eller godkänna.');
    if (action === 'checkout') {
      if (job.status !== 'accepted' || !job.helper_id) throw new ApiError(409, 'En hjälpare måste acceptera först.');
      const account = await accountFor(job.helper_id);
      if (!account) throw new ApiError(409, 'Hjälparen saknar Stripe-konto.');
      await readyAccount(account.account_id);
      const a = amounts(job.price);
      await db('job_payments?on_conflict=job_id', 'POST', { job_id: job.id, requester_id: user.id, helper_id: job.helper_id, account_id: account.account_id, amount: a.total, helper_amount: a.helper }, 'resolution=ignore-duplicates,return=representation');
      const p = await paymentFor(job.id);
      if (!p || p.blocked || p.paid_at) throw new ApiError(409, 'Betalningen är redan gjord eller spärrad.');
      if (p.checkout_id) {
        const session = await stripe<Session>(`checkout/sessions/${encodeURIComponent(p.checkout_id)}`);
        if (session.status === 'open' && session.url) return json({ url: session.url });
        if (session.payment_status === 'paid') { await markPaid(session); throw new ApiError(409, 'Redan betalt. Uppdatera sidan.'); }
        throw new ApiError(409, 'Betalningssessionen har löpt ut. Kontakta Helpy för att stämma av och återställa betalningsförsöket.');
      }
      if (Date.now() - Date.parse(p.checkout_started_at) > 23 * 3600 * 1000) throw new ApiError(409, 'Betalningsförsöket behöver stämmas av manuellt innan ett nytt kan skapas.');
      const session = await stripe<Session>('checkout/sessions', {
        mode: 'payment', 'payment_method_types[0]': 'card',
        success_url: `${origin()}/?stripe=paid`, cancel_url: `${origin()}/?stripe=cancelled`,
        'metadata[job_id]': job.id, 'payment_intent_data[metadata][job_id]': job.id,
        'payment_intent_data[transfer_group]': `helpy_${job.id}`,
        'line_items[0][price_data][currency]': 'sek', 'line_items[0][price_data][unit_amount]': String(p.amount),
        'line_items[0][price_data][product_data][name]': `Helpy: ${job.title}`, 'line_items[0][quantity]': '1',
      }, `helpy-checkout-${job.id}`);
      await db(`job_payments?job_id=eq.${job.id}`, 'PATCH', { checkout_id: session.id });
      if (!session.url) throw new ApiError(502, 'Betalningslänken saknas.');
      return json({ url: session.url });
    }
    if (action === 'approve') {
      const [p] = await db<Payment[]>('rpc/prepare_job_transfer', 'POST', { p_job: job.id, p_requester: user.id });
      if (!p) throw new ApiError(409, 'Betalningen är inte klar.');
      if (!p.transfer_id) {
        await readyAccount(p.account_id);
        if (!p.charge_id) throw new ApiError(409, 'Debiteringen saknas.');
        const charge = await stripe<Charge>(`charges/${encodeURIComponent(p.charge_id)}`);
        if (!charge.paid || charge.disputed || charge.amount_refunded > 0 || charge.amount !== p.amount || charge.currency !== 'sek') throw new ApiError(409, 'Betalningen behöver stämmas av innan överföring.');
        const transfer = await stripe<{ id: string }>('transfers', { amount: String(p.helper_amount), currency: 'sek', destination: p.account_id, source_transaction: p.charge_id, transfer_group: `helpy_${job.id}`, 'metadata[job_id]': job.id }, `helpy-transfer-${job.id}`);
        await db(`job_payments?job_id=eq.${job.id}`, 'PATCH', { transfer_id: transfer.id });
      }
      await db(`jobs?id=eq.${job.id}&status=eq.pending_approval`, 'PATCH', { status: 'completed' });
      return json({ completed: true });
    }
    return json({ error: 'Okänd betalningsåtgärd.' }, 404);
  } catch (error) {
    // Never include Stripe payloads, tokens or customer data in responses/logs.
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    return json({ error: 'Betalningsåtgärden misslyckades. Försök igen eller kontakta Helpy.' }, 500);
  }
}
