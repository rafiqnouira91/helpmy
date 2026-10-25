import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { amounts, verifySignature } from "../src/lib/stripe-core.mjs";
import { handleStripeRequest } from "../src/lib/stripe.server.ts";

const jobId = "11111111-1111-1111-1111-111111111111";
const user = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const helper = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const payment = {
  job_id: jobId,
  requester_id: user,
  helper_id: helper,
  account_id: "acct_test",
  amount: 50000,
  helper_amount: 42500,
  checkout_started_at: new Date().toISOString(),
  checkout_id: null,
  paid_at: null,
  blocked: false,
  transfer_id: null,
  charge_id: "ch_test",
};
Object.assign(process.env, {
  APP_URL: "https://helpy.example",
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  STRIPE_WEBHOOK_SECRET: "test-webhook-secret",
  SUPABASE_URL: "https://db.example",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
  SUPABASE_PUBLISHABLE_KEY: "test-public",
});
function request(action, body = { jobId }, origin = "https://helpy.example") {
  return new Request(`https://helpy.example/api/stripe/${action}`, {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: "Bearer test-user-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
function mock(t, handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const result = await handler(String(url), init);
    assert.notEqual(result, undefined, `Unexpected fetch: ${url}`);
    return Response.json(result);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
}
function common(url, job = {}) {
  if (url.includes("/rest/v1/job_payments?"))
    return [{ ...payment, paid_at: "2026-01-01T00:00:00Z" }];
  if (url.endsWith("/auth/v1/user")) return { id: user };
  if (url.includes("/rest/v1/jobs?"))
    return [
      {
        id: jobId,
        requester_id: user,
        helper_id: helper,
        status: "accepted",
        price: 500,
        title: "Testjobb",
        ...job,
      },
    ];
  if (url.includes("/rest/v1/stripe_accounts?"))
    return [{ user_id: helper, account_id: "acct_test" }];
  if (url.endsWith("/v1/accounts/acct_test"))
    return { id: "acct_test", payouts_enabled: true, capabilities: { transfers: "active" } };
}
test("öre conversion, fee, rounding and invalid amounts", () => {
  assert.deepEqual(amounts(500), { total: 50000, helper: 42500, fee: 7500 });
  assert.deepEqual(amounts(101), { total: 10100, helper: 8600, fee: 1500 });
  for (const value of [0, -5, 9, 1.5, NaN, Infinity, 100001]) assert.throws(() => amounts(value));
});
test("webhook signature checks raw body, timestamp and multiple signatures", async () => {
  const body = '{"type":"test"}',
    timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", "secret").update(`${timestamp}.${body}`).digest("hex");
  assert.equal(
    await verifySignature(body, `t=${timestamp},v1=${"0".repeat(64)},v1=${signature}`, "secret"),
    true,
  );
  assert.equal(
    await verifySignature(body + " ", `t=${timestamp},v1=${signature}`, "secret"),
    false,
  );
  assert.equal(await verifySignature(body, `t=${timestamp},v1=${signature}`, "wrong"), false);
  assert.equal(
    await verifySignature(
      body,
      `t=${timestamp},v1=${signature}`,
      "secret",
      (timestamp + 301) * 1000,
    ),
    false,
  );
  assert.equal(await verifySignature(body, null, "secret"), false);
});
test("reject cross-origin requests before using credentials", async () => {
  assert.equal(
    (await handleStripeRequest(request("checkout", {}, "https://evil.example"))).status,
    403,
  );
});
test("reject invalid webhook signatures", async () => {
  assert.equal((await handleStripeRequest(request("webhook"))).status, 400);
});
test("checkout derives amount and destination from database, ignores client amount", async (t) => {
  let checkout, patched;
  mock(t, (url, init) => {
    if (url.includes("/rest/v1/job_payments?")) {
      if (init.method === "PATCH") patched = JSON.parse(init.body);
      return [payment];
    }
    if (url.endsWith("/v1/checkout/sessions")) {
      checkout = new URLSearchParams(init.body);
      assert.equal(init.headers["Idempotency-Key"], `helpy-checkout-${jobId}`);
      return { id: "cs_test", url: "https://checkout.stripe.com/test" };
    }
    return common(url);
  });
  const r = await handleStripeRequest(
    request("checkout", { jobId, amount: 1, account: "attacker" }),
  );
  assert.equal(r.status, 200);
  assert.equal(checkout.get("line_items[0][price_data][unit_amount]"), "50000");
  assert.equal(checkout.get("payment_method_types[0]"), "card");
  assert.equal(checkout.get("payment_intent_data[capture_method]"), "manual");
  assert.deepEqual(patched, { checkout_id: "cs_test" });
});
test("helper cannot pay or approve on behalf of requester", async (t) => {
  mock(t, (url) => (url.endsWith("/auth/v1/user") ? { id: helper } : common(url)));
  assert.equal((await handleStripeRequest(request("checkout"))).status, 403);
  assert.equal((await handleStripeRequest(request("approve"))).status, 403);
});
test("reuse existing checkout without creating a second charge", async (t) => {
  mock(t, (url) => {
    if (url.includes("/rest/v1/job_payments?")) return [{ ...payment, checkout_id: "cs_existing" }];
    if (url.endsWith("/v1/checkout/sessions/cs_existing"))
      return { status: "open", url: "https://checkout.stripe.com/existing" };
    return common(url);
  });
  assert.deepEqual(await (await handleStripeRequest(request("checkout"))).json(), {
    url: "https://checkout.stripe.com/existing",
  });
});
test("expired idempotency window does not create another checkout", async (t) => {
  mock(t, (url) =>
    url.includes("/rest/v1/job_payments?")
      ? [{ ...payment, checkout_started_at: "2020-01-01T00:00:00Z" }]
      : common(url),
  );
  assert.equal((await handleStripeRequest(request("checkout"))).status, 409);
});
test("approval transfers fixed net amount then completes job", async (t) => {
  const steps = [];
  mock(t, (url, init) => {
    if (url.includes("/rpc/prepare_job_transfer"))
      return [{ ...payment, paid_at: new Date().toISOString() }];
    if (url.endsWith("/v1/charges/ch_test"))
      return { paid: true, disputed: false, amount_refunded: 0, amount: 50000, currency: "sek" };
    if (url.endsWith("/v1/transfers")) {
      const fields = new URLSearchParams(init.body);
      assert.equal(fields.get("amount"), "42500");
      assert.equal(fields.get("destination"), "acct_test");
      assert.equal(fields.get("source_transaction"), "ch_test");
      assert.equal(init.headers["Idempotency-Key"], `helpy-transfer-${jobId}`);
      steps.push("transfer");
      return { id: "tr_test" };
    }
    if (url.includes("/rest/v1/job_payments?")) {
      if (init.method === "PATCH") {
        steps.push("save-transfer");
        return [];
      }
      return [{ ...payment, paid_at: new Date().toISOString() }];
    }
    if (url.includes("/rest/v1/jobs?") && init.method === "PATCH") {
      steps.push("complete");
      return [];
    }
    return common(url, { status: "pending_approval" });
  });
  assert.equal((await handleStripeRequest(request("approve"))).status, 200);
  assert.deepEqual(steps, ["transfer", "save-transfer", "complete"]);
});
test("refunded charge blocks approval without transfer", async (t) => {
  mock(t, (url) => {
    if (url.includes("/rpc/prepare_job_transfer"))
      return [{ ...payment, paid_at: new Date().toISOString() }];
    if (url.endsWith("/v1/charges/ch_test"))
      return {
        paid: true,
        disputed: false,
        amount_refunded: 50000,
        amount: 50000,
        currency: "sek",
      };
    return common(url, { status: "pending_approval" });
  });
  assert.equal((await handleStripeRequest(request("approve"))).status, 409);
});
test("retry after saved transfer completes without sending money twice", async (t) => {
  mock(t, (url, init) => {
    if (url.includes("/rpc/prepare_job_transfer"))
      return [{ ...payment, transfer_id: "tr_already_sent" }];
    if (url.includes("/rest/v1/jobs?") && init.method === "PATCH") return [];
    return common(url, { status: "pending_approval" });
  });
  assert.equal((await handleStripeRequest(request("approve"))).status, 200);
});
function signedRequest(event) {
  const body = JSON.stringify(event),
    timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return new Request("https://helpy.example/api/stripe/webhook", {
    method: "POST",
    headers: { "Stripe-Signature": `t=${timestamp},v1=${signature}` },
    body,
  });
}
test("signed webhook records payment, duplicate delivery remains safe", async (t) => {
  const updates = [];
  mock(t, (url, init) => {
    if (url.includes("/rest/v1/job_payments?")) {
      if (init.method === "PATCH") updates.push(JSON.parse(init.body));
      return [{ ...payment, checkout_id: "cs_paid" }];
    }
    if (url.endsWith("/v1/payment_intents/pi_test"))
      return {
        id: "pi_test",
        latest_charge: "ch_test",
        status: "succeeded",
        amount: 50000,
        currency: "sek",
        metadata: { job_id: jobId },
      };
  });
  const event = {
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_paid",
        metadata: { job_id: jobId },
        amount_total: 50000,
        currency: "sek",
        payment_status: "paid",
        payment_intent: "pi_test",
      },
    },
  };
  for (let i = 0; i < 2; i++)
    assert.equal((await handleStripeRequest(signedRequest(event))).status, 200);
  assert.equal(updates.length, 2);
  assert.equal(updates[0].charge_id, "ch_test");
  assert.equal(updates[0].payment_intent_id, "pi_test");
  assert.ok(updates[0].paid_at);
});
test("signed but mismatching or unpaid checkout never marks paid", async (t) => {
  mock(t, (url) =>
    url.includes("/rest/v1/job_payments?") ? [{ ...payment, checkout_id: "cs_paid" }] : undefined,
  );
  for (const fields of [{ amount_total: 1 }, { currency: "eur" }, { id: "cs_wrong" }]) {
    const event = {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_paid",
          metadata: { job_id: jobId },
          amount_total: 50000,
          currency: "sek",
          payment_status: "paid",
          payment_intent: "pi_test",
          ...fields,
        },
      },
    };
    assert.equal((await handleStripeRequest(signedRequest(event))).status, 200);
  }
});
test("refund and dispute events permanently block automatic transfers", async (t) => {
  const changes = [];
  mock(t, (url, init) => {
    assert.ok(url.endsWith("charge_id=eq.ch_test"));
    changes.push(JSON.parse(init.body));
    return [];
  });
  for (const event of [
    { type: "charge.refunded", data: { object: { id: "ch_test" } } },
    { type: "charge.dispute.created", data: { object: { charge: "ch_test" } } },
  ])
    assert.equal((await handleStripeRequest(signedRequest(event))).status, 200);
  assert.deepEqual(changes, [{ blocked: true }, { blocked: true }]);
});
test("failed Stripe transfer cannot complete a job", async (t) => {
  mock(t, (url) => {
    if (url.includes("/rpc/prepare_job_transfer"))
      return [{ ...payment, paid_at: new Date().toISOString() }];
    if (url.endsWith("/v1/charges/ch_test"))
      return { paid: true, disputed: false, amount_refunded: 0, amount: 50000, currency: "sek" };
    if (url.endsWith("/v1/transfers")) throw new Error("Simulated connection loss");
    return common(url, { status: "pending_approval" });
  });
  assert.equal((await handleStripeRequest(request("approve"))).status, 500);
});

test("live keys and live webhook events are rejected", async () => {
  const key = process.env.STRIPE_SECRET_KEY;
  try {
    process.env.STRIPE_SECRET_KEY = "sk_live_not_a_real_key";
    assert.equal((await handleStripeRequest(request("checkout"))).status, 403);
  } finally {
    process.env.STRIPE_SECRET_KEY = key;
  }
  assert.equal(
    (
      await handleStripeRequest(
        signedRequest({ livemode: true, type: "test", data: { object: {} } }),
      )
    ).status,
    403,
  );
});
test("manual authorization is recorded without marking the card charged", async (t) => {
  const changes = [];
  mock(t, (url, init) => {
    if (url.includes("/rest/v1/job_payments?")) {
      if (init.method === "PATCH") changes.push(JSON.parse(init.body));
      return [{ ...payment, checkout_id: "cs_reserved" }];
    }
    if (url.endsWith("/v1/payment_intents/pi_reserved"))
      return {
        id: "pi_reserved",
        status: "requires_capture",
        amount: 50000,
        currency: "sek",
        latest_charge: "ch_test",
        metadata: { job_id: jobId },
      };
  });
  const event = {
    livemode: false,
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_reserved",
        metadata: { job_id: jobId },
        amount_total: 50000,
        currency: "sek",
        payment_status: "unpaid",
        payment_intent: "pi_reserved",
      },
    },
  };
  assert.equal((await handleStripeRequest(signedRequest(event))).status, 200);
  assert.ok(changes[0].authorized_at);
  assert.equal(changes[0].paid_at, undefined);
});
test("approve captures a reservation before transferring and completing", async (t) => {
  const p = { ...payment, authorized_at: "2026-01-01T00:00:00Z", payment_intent_id: "pi_reserved" };
  const steps = [];
  mock(t, (url, init) => {
    if (url.includes("/rest/v1/job_payments?")) {
      if (init.method === "PATCH") {
        const change = JSON.parse(init.body);
        Object.assign(p, change);
        steps.push(change.paid_at ? "save-paid" : "save-transfer");
      }
      return [p];
    }
    if (url.endsWith("/v1/payment_intents/pi_reserved"))
      return {
        id: "pi_reserved",
        status: "requires_capture",
        amount: 50000,
        currency: "sek",
        metadata: { job_id: jobId },
      };
    if (url.endsWith("/v1/payment_intents/pi_reserved/capture")) {
      steps.push("capture");
      return { status: "succeeded" };
    }
    if (url.includes("/rpc/prepare_job_transfer")) {
      assert.ok(p.paid_at);
      return [p];
    }
    if (url.endsWith("/v1/charges/ch_test"))
      return { paid: true, amount_refunded: 0, disputed: false, amount: 50000, currency: "sek" };
    if (url.endsWith("/v1/transfers")) {
      steps.push("transfer");
      return { id: "tr_reserved" };
    }
    if (url.includes("/rest/v1/jobs?") && init.method === "PATCH") {
      steps.push("complete");
      return [];
    }
    return common(url, { status: "pending_approval" });
  });
  assert.equal((await handleStripeRequest(request("approve"))).status, 200);
  assert.deepEqual(steps, ["capture", "save-paid", "transfer", "save-transfer", "complete"]);
});
test("expired reservation prevents transfer and job completion", async (t) => {
  mock(t, (url) => {
    if (url.includes("/rest/v1/job_payments?"))
      return [
        { ...payment, authorized_at: "2026-01-01T00:00:00Z", payment_intent_id: "pi_expired" },
      ];
    if (url.endsWith("/v1/payment_intents/pi_expired"))
      return { status: "canceled", amount: 50000, currency: "sek", metadata: { job_id: jobId } };
    return common(url, { status: "pending_approval" });
  });
  assert.equal((await handleStripeRequest(request("approve"))).status, 409);
});
