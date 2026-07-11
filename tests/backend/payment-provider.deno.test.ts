import {
  decryptSensitiveJson,
  encryptSensitiveJson,
  ProviderError,
  sanitizeProviderPayload,
  sha256Hex,
} from "../../supabase/functions/_shared/core.ts";
import {
  normalizedProviderResult,
  normalizeRefundReceiveAccount,
  paymentConfirmationDisposition,
  paymentProvider,
  providerFailureIsDefinitive,
} from "../../supabase/functions/_shared/payments.ts";
import {
  type EdgeHandler,
  invokeJson,
  jsonResult,
  requestJson,
  supabaseRpcName,
  withEnvironment,
  withFetchMock,
} from "./edge-handler-harness.ts";
import { rpc } from "../../supabase/functions/_shared/supabase.ts";
import { handler as adminMembersHandler } from "./edge-handlers/admin-members.ts";
import { handler as authAssistHandler } from "./edge-handlers/auth-assist.ts";
import { handler as getOrderHandler } from "./edge-handlers/get-order.ts";
import { handler as guestOrderLookupHandler } from "./edge-handlers/guest-order-lookup.ts";
import { handler as loginHandler } from "./edge-handlers/login-with-identifier.ts";
import { handler as paymentConfirmHandler } from "./edge-handlers/payment-confirm.ts";
import { handler as paymentWebhookHandler } from "./edge-handlers/payment-webhook.ts";
import { handler as signupHandler } from "./edge-handlers/signup-with-login-id.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${message}\nexpected: ${expectedJson}\nactual:   ${actualJson}`,
    );
  }
}

const EDGE_ENV = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  PAYMENT_PROVIDER: "mock",
  DENO_ENV: "test",
  AUTH_RATE_LIMIT_PEPPER: "test-rate-limit-pepper-at-least-32-bytes",
  GUEST_ORDER_TOKEN_SECRET: "test-guest-token-secret-at-least-32-bytes",
  ALLOWED_ORIGINS: "http://localhost:3000",
} as const;

const edgeHandlers = new Map<string, EdgeHandler>([
  ["admin-members", adminMembersHandler],
  ["auth-assist", authAssistHandler],
  ["get-order", getOrderHandler],
  ["guest-order-lookup", guestOrderLookupHandler],
  ["login-with-identifier", loginHandler],
  ["payment-confirm", paymentConfirmHandler],
  ["payment-webhook", paymentWebhookHandler],
  ["signup-with-login-id", signupHandler],
]);

Deno.test("Supabase secret API keys stay in apikey while legacy service JWTs retain Bearer auth", async () => {
  const secretKey = "sb_" + "secret_test-service-key";
  await withEnvironment({
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: secretKey }),
    SUPABASE_SERVICE_ROLE_KEY: "legacy-value-must-not-win",
  }, async () => {
    await withFetchMock((request) => {
      assert(
        request.headers.get("apikey") === secretKey,
        "new secret key was not sent as apikey",
      );
      assert(
        !request.headers.has("authorization"),
        "opaque secret key was incorrectly sent as a Bearer JWT",
      );
      return jsonResult({ ok: true });
    }, async () => {
      await rpc("test_service_key_v1", {});
    });
  });

  const legacyJwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature";
  await withEnvironment({
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SECRET_KEYS: null,
    SUPABASE_SERVICE_ROLE_KEY: legacyJwt,
  }, async () => {
    await withFetchMock((request) => {
      assert(
        request.headers.get("apikey") === legacyJwt,
        "legacy service key was not sent as apikey",
      );
      assert(
        request.headers.get("authorization") === `Bearer ${legacyJwt}`,
        "legacy service JWT lost Bearer authorization",
      );
      return jsonResult({ ok: true });
    }, async () => {
      await rpc("test_legacy_service_key_v1", {});
    });
  });
});

async function edgeHandler(name: string): Promise<EdgeHandler> {
  const handler = edgeHandlers.get(name);
  if (!handler) throw new Error(`No captured Edge handler: ${name}`);
  return handler;
}

async function withEdgeMocks<T>(
  responder: (request: Request) => Response | Promise<Response>,
  run: () => Promise<T>,
  extraEnv: Record<string, string | null> = {},
): Promise<T> {
  return await withEnvironment({ ...EDGE_ENV, ...extraEnv }, async () => {
    return await withFetchMock(responder, run);
  });
}

function rpcOnlyResponder(
  rpc: (
    name: string,
    body: Record<string, unknown>,
    request: Request,
  ) => unknown | Promise<unknown>,
  other?: (request: Request) => Response | Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const name = supabaseRpcName(request);
    if (name) {
      return jsonResult(await rpc(name, await requestJson(request), request));
    }
    if (other) return await other(request);
    throw new Error(
      `Unexpected HTTP request: ${request.method} ${request.url}`,
    );
  };
}

Deno.test("mock provider covers success, failure, virtual account, cancel, and partial ledger", async () => {
  const previousProvider = Deno.env.get("PAYMENT_PROVIDER");
  const previousEnvironment = Deno.env.get("DENO_ENV");
  Deno.env.set("PAYMENT_PROVIDER", "mock");
  Deno.env.set("DENO_ENV", "test");
  try {
    const provider = paymentProvider();
    const success = normalizedProviderResult(
      await provider.confirm({
        paymentKey: "mock-success-key",
        orderId: "RB-MOCK-SUCCESS",
        amount: 18000,
        idempotencyKey: "confirm_mock_success_123456",
        scenario: "success",
      }),
    );
    assert(
      success.status === "DONE" && success.amount === 18000,
      "mock success was not DONE",
    );

    const waiting = normalizedProviderResult(
      await provider.confirm({
        paymentKey: "mock-waiting-key",
        orderId: "RB-MOCK-WAITING",
        amount: 22000,
        idempotencyKey: "confirm_mock_waiting_123456",
        scenario: "waiting",
      }),
    );
    assert(
      waiting.status === "WAITING_FOR_DEPOSIT" && Boolean(waiting.virtualDueAt),
      "virtual account due date is missing",
    );

    let rejected = false;
    try {
      await provider.confirm({
        paymentKey: "mock-failure-key",
        orderId: "RB-MOCK-FAILURE",
        amount: 12000,
        idempotencyKey: "confirm_mock_failure_123456",
        scenario: "failure",
      });
    } catch (error) {
      rejected = error instanceof ProviderError && error.definitive;
    }
    assert(rejected, "definitive mock failure was not surfaced");

    const canceled = normalizedProviderResult(
      await provider.cancel({
        paymentKey: "mock-success-key",
        cancelReason: "test cancellation",
        cancelAmount: 18000,
        idempotencyKey: "cancel_mock_success_123456",
        scenario: "success",
      }),
    );
    assert(
      canceled.status === "CANCELED" && canceled.canceledAmount === 18000,
      "mock cancellation ledger is wrong",
    );

    const partial = normalizedProviderResult({
      paymentKey: "partial-key",
      orderId: "RB-PARTIAL",
      totalAmount: 20000,
      balanceAmount: 12000,
      status: "PARTIAL_CANCELED",
      cancels: [{ cancelAmount: 3000 }, { cancelAmount: 5000 }],
    });
    assert(
      partial.canceledAmount === 8000,
      "partial cancellation cumulative amount is wrong",
    );
  } finally {
    if (previousProvider == null) Deno.env.delete("PAYMENT_PROVIDER");
    else Deno.env.set("PAYMENT_PROVIDER", previousProvider);
    if (previousEnvironment == null) Deno.env.delete("DENO_ENV");
    else Deno.env.set("DENO_ENV", previousEnvironment);
  }
});

Deno.test("mock payments fail closed unless the runtime is explicitly non-production", async () => {
  await withEnvironment({ PAYMENT_PROVIDER: "mock", DENO_ENV: null }, async () => {
    let rejected = false;
    try {
      paymentProvider();
    } catch (error) {
      rejected = error instanceof Error && error.message.includes("outside explicit non-production");
    }
    assert(rejected, "missing DENO_ENV enabled the mock payment provider");
  });
  await withEnvironment({ PAYMENT_PROVIDER: "mock", DENO_ENV: "production" }, async () => {
    let rejected = false;
    try {
      paymentProvider();
    } catch (error) {
      rejected = error instanceof Error && error.message.includes("outside explicit non-production");
    }
    assert(rejected, "production enabled the mock payment provider");
  });
});

Deno.test("confirmation dispositions keep nonterminal and cancellation states in reconciliation", () => {
  for (const status of ["DONE", "WAITING_FOR_DEPOSIT"]) {
    assert(
      paymentConfirmationDisposition(status) === "success",
      `${status} was not successful`,
    );
  }
  for (
    const status of ["READY", "IN_PROGRESS", "CANCELED", "PARTIAL_CANCELED"]
  ) {
    assert(
      paymentConfirmationDisposition(status) === "reconcile",
      `${status} was incorrectly finalized as failed`,
    );
  }
  for (const status of ["ABORTED", "EXPIRED"]) {
    assert(
      paymentConfirmationDisposition(status) === "terminal_failure",
      `${status} was not terminal`,
    );
  }
});

Deno.test("provider retryable errors never finalize an idempotent request as failed", () => {
  for (
    const [status, code] of [
      [409, "IDEMPOTENT_REQUEST_PROCESSING"],
      [400, "PROVIDER_ERROR"],
      [403, "FORBIDDEN_CONSECUTIVE_REQUEST"],
      [400, "ALREADY_PROCESSED_PAYMENT"],
      [400, "ALREADY_CANCELED_PAYMENT"],
      [408, "REQUEST_TIMEOUT"],
      [425, "TOO_EARLY"],
      [429, "TOO_MANY_REQUESTS"],
      [500, "UNKNOWN_SERVER_ERROR"],
    ] as const
  ) {
    assert(
      !providerFailureIsDefinitive(status, code),
      `${status} ${code} was incorrectly definitive`,
    );
  }
  assert(
    providerFailureIsDefinitive(400, "INVALID_REQUEST"),
    "a permanent validation error was not definitive",
  );
  assert(
    providerFailureIsDefinitive(401, "UNAUTHORIZED_KEY"),
    "an authorization error was not definitive",
  );
});

Deno.test("virtual-account refund details are validated, encrypted, and redacted", async () => {
  const secret =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const account = normalizeRefundReceiveAccount({
    bank: "88",
    accountNumber: "1234567890",
    holderName: "홍길동",
  });
  assert(account !== null, "valid refund account was rejected");
  const ciphertext = await encryptSensitiveJson(secret, account);
  assert(ciphertext.startsWith("v1."), "ciphertext version is missing");
  assert(
    !ciphertext.includes(account.accountNumber) &&
      !ciphertext.includes(account.holderName),
    "ciphertext leaked plaintext",
  );
  const decrypted = normalizeRefundReceiveAccount(
    await decryptSensitiveJson(secret, ciphertext),
  );
  assert(
    JSON.stringify(decrypted) === JSON.stringify(account),
    "encrypted refund account did not round-trip",
  );
  const sanitized = sanitizeProviderPayload({
    virtualAccount: { refundReceiveAccount: account },
    status: "CANCELED",
  }) as Record<string, unknown>;
  assert(
    !JSON.stringify(sanitized).includes(account.accountNumber),
    "safe provider payload leaked account number",
  );
  assert(
    !JSON.stringify(sanitized).includes(account.holderName),
    "safe provider payload leaked holder name",
  );
  let rejected = false;
  try {
    normalizeRefundReceiveAccount({
      bank: "88",
      accountNumber: "123-456",
      holderName: "홍길동",
    });
  } catch {
    rejected = true;
  }
  assert(rejected, "hyphenated refund account was accepted");
});

Deno.test("payment-confirm HTTP flow handles mock success once and returns the idempotent result on retry", async () => {
  const handler = await edgeHandler("payment-confirm");
  const claims: Record<string, unknown>[] = [];
  let finalized = false;
  let finalizeCount = 0;
  const responder = rpcOnlyResponder(async (name, body) => {
    if (name === "consume_edge_rate_limit_v1") {
      return { allowed: true, retryAfter: 0 };
    }
    if (name === "claim_payment_confirmation_v1") {
      claims.push(body);
      return {
        totalKrw: 18_000,
        paymentMethod: "card",
        alreadyFinalized: finalized,
        attemptStatus: finalized ? "succeeded" : "started",
        status: finalized ? "paid" : "payment_auth_started",
        paymentStatus: finalized ? "done" : "in_progress",
      };
    }
    if (name === "finalize_payment_confirmation_v1") {
      finalizeCount += 1;
      finalized = true;
      assert(
        body.p_provider_status === "DONE",
        "mock success did not finalize from provider DONE",
      );
      assert(body.p_amount === 18_000, "server finalization amount changed");
      return { status: "paid", paymentStatus: "done", orderNo: "RB-MOCK-1001" };
    }
    throw new Error(`Unexpected RPC in payment success: ${name}`);
  });

  await withEdgeMocks(responder, async () => {
    const input = {
      paymentKey: "mock-card-payment-key",
      orderId: "RB-MOCK-1001",
      amount: 18_000,
      guestLookupToken: "guest-lookup-token-for-payment",
      mockScenario: "success",
    };
    const first = await invokeJson(handler, "payment-confirm", input);
    assert(
      first.response.status === 200,
      `mock confirmation failed with ${first.response.status}`,
    );
    assert(
      first.payload.paid === true,
      "DONE confirmation was not exposed as paid",
    );
    assert(
      first.payload.waitingForDeposit === false,
      "card success was marked waiting for deposit",
    );

    const retry = await invokeJson(handler, "payment-confirm", input);
    assert(
      retry.response.status === 200,
      `idempotent retry failed with ${retry.response.status}`,
    );
    assert(
      retry.payload.duplicate === true,
      "second confirmation was not identified as duplicate",
    );
  });

  assert(
    finalizeCount === 1,
    `duplicate confirmation finalized ${finalizeCount} times`,
  );
  assert(
    claims.length === 2,
    "both confirmation requests must pass through the DB claim",
  );
  assert(
    claims[0].p_idempotency_key === claims[1].p_idempotency_key,
    "confirmation retry did not derive a stable idempotency key",
  );
  assert(
    claims[0].p_request_hash === claims[1].p_request_hash,
    "identical confirmation retries did not derive a stable request hash",
  );
});

Deno.test("payment-confirm HTTP flow rejects a tampered amount before provider finalization", async () => {
  const handler = await edgeHandler("payment-confirm");
  const mutationRpcs: string[] = [];
  const responder = rpcOnlyResponder(async (name) => {
    if (name === "consume_edge_rate_limit_v1") {
      return { allowed: true, retryAfter: 0 };
    }
    if (name === "claim_payment_confirmation_v1") {
      return {
        totalKrw: 18_000,
        paymentMethod: "card",
        attemptStatus: "started",
      };
    }
    mutationRpcs.push(name);
    return {};
  });

  await withEdgeMocks(responder, async () => {
    const result = await invokeJson(handler, "payment-confirm", {
      paymentKey: "mock-tampered-payment-key",
      orderId: "RB-MOCK-1002",
      amount: 1,
      guestLookupToken: "guest-lookup-token-for-payment",
      mockScenario: "success",
    });
    assert(
      result.response.status === 409,
      `tampered amount returned ${result.response.status}`,
    );
    assert(
      result.payload.code === "PAYMENT_AMOUNT_MISMATCH",
      "tampered amount had the wrong public error",
    );
  });
  assertEqual(
    mutationRpcs,
    [],
    "tampered amount reached a finalization/failure mutation RPC",
  );
});

Deno.test("payment-confirm HTTP flow records a definitive mock card failure without marking paid", async () => {
  const handler = await edgeHandler("payment-confirm");
  let failureBody: Record<string, unknown> | null = null;
  let finalized = false;
  const responder = rpcOnlyResponder(async (name, body) => {
    if (name === "consume_edge_rate_limit_v1") {
      return { allowed: true, retryAfter: 0 };
    }
    if (name === "claim_payment_confirmation_v1") {
      return {
        totalKrw: 18_000,
        paymentMethod: "card",
        attemptStatus: "started",
      };
    }
    if (name === "fail_payment_confirmation_v1") {
      failureBody = body;
      return {};
    }
    if (name === "finalize_payment_confirmation_v1") {
      finalized = true;
      return {};
    }
    throw new Error(`Unexpected RPC in payment failure: ${name}`);
  });

  await withEdgeMocks(responder, async () => {
    const result = await invokeJson(handler, "payment-confirm", {
      paymentKey: "mock-failed-payment-key",
      orderId: "RB-MOCK-1003",
      amount: 18_000,
      guestLookupToken: "guest-lookup-token-for-payment",
      mockScenario: "failure",
    });
    assert(
      result.response.status === 402,
      `mock failure returned ${result.response.status}`,
    );
    assert(
      result.payload.code === "PAYMENT_REJECTED",
      "mock failure had the wrong public error",
    );
  });
  assert(!finalized, "definitive provider failure reached paid finalization");
  const recordedFailure = failureBody as unknown as
    | Record<string, unknown>
    | null;
  assert(
    recordedFailure?.p_definitive === true,
    "definitive provider failure was stored as retryable",
  );
  assert(
    recordedFailure?.p_error_code === "MOCK_REJECTED",
    "provider failure code was not retained safely",
  );
});

Deno.test("virtual-account webhook moves waiting to deposited and makes a duplicate transmission harmless", async () => {
  const handler = await edgeHandler("payment-webhook");
  const events = new Map<string, { eventId: string; processed: boolean }>();
  const eventKeys = new Map<string, string>();
  const appliedStatuses: string[] = [];
  let nextEvent = 1;
  const responder = rpcOnlyResponder(async (name, body) => {
    if (name === "consume_edge_rate_limit_v1") {
      return { allowed: true, retryAfter: 0 };
    }
    if (name === "claim_payment_webhook_v1") {
      const key = String(body.p_dedupe_key);
      const existing = events.get(key);
      if (existing) {
        return {
          eventId: existing.eventId,
          processed: existing.processed,
          duplicate: true,
        };
      }
      const eventId = `00000000-0000-4000-8000-${
        String(nextEvent++).padStart(12, "0")
      }`;
      events.set(key, { eventId, processed: false });
      eventKeys.set(eventId, key);
      return { eventId, processed: false, processing: false, duplicate: false };
    }
    if (name === "apply_payment_webhook_v1") {
      const status = String(body.p_provider_status);
      appliedStatuses.push(status);
      const key = eventKeys.get(String(body.p_event_id));
      assert(Boolean(key), "webhook apply used an unclaimed event");
      events.get(key!)!.processed = true;
      return {
        orderNo: "RB-VIRTUAL-1001",
        status: status === "DONE" ? "paid" : "waiting_for_deposit",
        paymentStatus: status === "DONE" ? "done" : "waiting_for_deposit",
      };
    }
    throw new Error(`Unexpected RPC in webhook flow: ${name}`);
  });

  await withEdgeMocks(responder, async () => {
    const base = {
      eventType: "PAYMENT_STATUS_CHANGED",
      data: {
        paymentKey: "mock-virtual-payment-key",
        orderId: "RB-VIRTUAL-1001",
        totalAmount: 22_000,
        method: "VIRTUAL_ACCOUNT",
      },
    };
    const waiting = await invokeJson(handler, "payment-webhook", {
      ...base,
      data: {
        ...base.data,
        status: "WAITING_FOR_DEPOSIT",
        virtualAccount: { dueDate: "2026-07-12T12:00:00.000Z" },
      },
    }, { "tosspayments-webhook-transmission-id": "transmission-waiting-1" });
    assert(
      waiting.response.status === 200,
      `waiting webhook returned ${waiting.response.status}`,
    );
    assert(
      waiting.payload.status === "waiting_for_deposit",
      "waiting webhook collapsed into paid",
    );

    const depositedBody = {
      ...base,
      data: {
        ...base.data,
        status: "DONE",
        approvedAt: "2026-07-11T12:00:00.000Z",
        transactionKey: "virtual-deposit-transaction",
      },
    };
    const deposited = await invokeJson(
      handler,
      "payment-webhook",
      depositedBody,
      {
        "tosspayments-webhook-transmission-id": "transmission-deposited-1",
      },
    );
    assert(
      deposited.response.status === 200,
      `deposit webhook returned ${deposited.response.status}`,
    );
    assert(
      deposited.payload.status === "done",
      "deposit webhook did not reach provider done state",
    );

    const duplicate = await invokeJson(
      handler,
      "payment-webhook",
      depositedBody,
      {
        "tosspayments-webhook-transmission-id": "transmission-deposited-1",
      },
    );
    assert(
      duplicate.response.status === 200,
      `duplicate webhook returned ${duplicate.response.status}`,
    );
    assert(
      duplicate.payload.duplicate === true,
      "duplicate transmission was not short-circuited",
    );
  });

  assertEqual(
    appliedStatuses,
    ["WAITING_FOR_DEPOSIT", "DONE"],
    "duplicate webhook re-applied a payment transition",
  );
});

Deno.test("get-order HTTP boundary returns self/CS/owner orders and denies other or non-CS operational actors", async () => {
  const handler = await edgeHandler("get-order");
  const identities: Record<string, string> = {
    "member-self-token": "11111111-1111-4111-8111-111111111111",
    "member-other-token": "22222222-2222-4222-8222-222222222222",
    "inventory-token": "33333333-3333-4333-8333-333333333333",
    "payments-token": "44444444-4444-4444-8444-444444444444",
    "cs-token": "55555555-5555-4555-8555-555555555555",
    "owner-token": "66666666-6666-4666-8666-666666666666",
  };
  const allowed = new Set([
    identities["member-self-token"],
    identities["cs-token"],
    identities["owner-token"],
  ]);
  const actorIds: string[] = [];
  const responder = rpcOnlyResponder(async (name, body) => {
    if (name === "consume_edge_rate_limit_v1") {
      return { allowed: true, retryAfter: 0 };
    }
    if (name === "get_order_v1") {
      const actorId = String(body.p_actor_user_id);
      actorIds.push(actorId);
      assert(
        body.p_guest_token_hash === null,
        "member lookup unexpectedly used a guest token",
      );
      return allowed.has(actorId)
        ? {
          orderNo: "RB-MEMBER-1001",
          status: "paid",
          customer: { name: "허용 사용자" },
        }
        : null;
    }
    throw new Error(`Unexpected RPC in member lookup: ${name}`);
  }, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/auth/v1/user") {
      const token =
        request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
      const id = identities[token];
      return jsonResult(
        id ? { id, email: `${token}@example.test` } : { status: 401, body: {} },
      );
    }
    throw new Error(
      `Unexpected HTTP request in member lookup: ${request.method} ${request.url}`,
    );
  });

  await withEdgeMocks(responder, async () => {
    for (const token of ["member-self-token", "cs-token", "owner-token"]) {
      const result = await invokeJson(handler, "get-order", {
        orderNo: "RB-MEMBER-1001",
      }, {
        authorization: `Bearer ${token}`,
      });
      assert(
        result.response.status === 200,
        `${token} could not read an allowed full order`,
      );
      assert(
        (result.payload.order as Record<string, unknown>)?.orderNo ===
          "RB-MEMBER-1001",
        "allowed order payload changed",
      );
    }
    for (
      const token of ["member-other-token", "inventory-token", "payments-token"]
    ) {
      const result = await invokeJson(handler, "get-order", {
        orderNo: "RB-MEMBER-1001",
      }, {
        authorization: `Bearer ${token}`,
      });
      assert(
        result.response.status === 404,
        `${token} received another user's full order`,
      );
      assert(
        result.payload.code === "ORDER_NOT_FOUND",
        `${token} denial disclosed a different error`,
      );
    }
  });
  assertEqual(
    actorIds.toSorted(),
    Object.values(identities).toSorted(),
    "Edge lookup did not bind all requests to the authenticated actor",
  );
});

Deno.test("guest order HTTP lookup hashes the capability token and never accepts order number alone", async () => {
  const handler = await edgeHandler("guest-order-lookup");
  const lookupToken = "guest-capability-token-with-high-entropy-1001";
  const expectedHash = await sha256Hex(lookupToken);
  const lookupBodies: Record<string, unknown>[] = [];
  const responder = rpcOnlyResponder(async (name, body) => {
    if (name === "consume_edge_rate_limit_v1") {
      return { allowed: true, retryAfter: 0 };
    }
    if (name === "get_order_v1") {
      lookupBodies.push(body);
      return body.p_guest_token_hash === expectedHash
        ? { orderNo: "RB-GUEST-1001", status: "payment_ready" }
        : null;
    }
    throw new Error(`Unexpected RPC in guest lookup: ${name}`);
  });

  await withEdgeMocks(responder, async () => {
    const found = await invokeJson(handler, "guest-order-lookup", {
      orderNo: "RB-GUEST-1001",
      lookupToken,
    });
    assert(
      found.response.status === 200,
      `valid guest capability returned ${found.response.status}`,
    );
    assert(
      (found.payload.order as Record<string, unknown>)?.orderNo ===
        "RB-GUEST-1001",
      "guest order payload is missing",
    );

    const missingToken = await invokeJson(handler, "guest-order-lookup", {
      orderNo: "RB-GUEST-1001",
    });
    assert(
      missingToken.response.status === 404,
      "order number alone was accepted for guest lookup",
    );
    assert(
      missingToken.payload.code === "ORDER_NOT_FOUND",
      "guest denial exposed lookup details",
    );
  });
  assert(
    lookupBodies.length === 1,
    "tokenless guest request reached trusted lookup",
  );
  assert(
    lookupBodies[0].p_actor_user_id === null,
    "guest lookup supplied an authenticated actor",
  );
  assert(
    lookupBodies[0].p_guest_token_hash === expectedHash,
    "guest capability was not SHA-256 hashed",
  );
  assert(
    !JSON.stringify(lookupBodies[0]).includes(lookupToken),
    "raw guest capability crossed into the DB RPC",
  );
});

Deno.test("admin members HTTP boundary denies customer/inventory/payments and permits only CS/owner", async () => {
  const handler = await edgeHandler("admin-members");
  const actors: Record<string, { id: string; role: string }> = {
    "customer-token": {
      id: "10000000-0000-4000-8000-000000000001",
      role: "customer",
    },
    "inventory-token": {
      id: "10000000-0000-4000-8000-000000000002",
      role: "inventory_manager",
    },
    "payments-token": {
      id: "10000000-0000-4000-8000-000000000003",
      role: "payments_manager",
    },
    "cs-token": {
      id: "10000000-0000-4000-8000-000000000004",
      role: "cs_manager",
    },
    "owner-token": {
      id: "10000000-0000-4000-8000-000000000005",
      role: "owner_admin",
    },
  };
  const profileReads: string[] = [];
  const responder = rpcOnlyResponder(async (name) => {
    if (name === "consume_edge_rate_limit_v1") {
      return { allowed: true, retryAfter: 0 };
    }
    throw new Error(`Unexpected RPC in admin members: ${name}`);
  }, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/auth/v1/user") {
      const token =
        request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
      return jsonResult(
        actors[token] ? { id: actors[token].id } : { status: 401, body: {} },
      );
    }
    if (url.pathname === "/rest/v1/user_roles") {
      const userFilter = url.searchParams.get("user_id") || "";
      const actor = Object.values(actors).find((candidate) =>
        userFilter === `eq.${candidate.id}`
      );
      return jsonResult(actor ? [{ role: actor.role }] : []);
    }
    if (
      url.pathname === "/rest/v1/profiles" || url.pathname === "/rest/v1/orders"
    ) {
      profileReads.push(url.pathname);
      return jsonResult([]);
    }
    throw new Error(
      `Unexpected HTTP request in admin members: ${request.method} ${request.url}`,
    );
  });

  await withEdgeMocks(responder, async () => {
    for (
      const token of ["customer-token", "inventory-token", "payments-token"]
    ) {
      const result = await invokeJson(handler, "admin-members", {}, {
        authorization: `Bearer ${token}`,
      }, "GET");
      assert(
        result.response.status === 403,
        `${actors[token].role} reached the member PII endpoint`,
      );
    }
    assert(
      profileReads.length === 0,
      "member PII was queried before role denial",
    );

    for (const token of ["cs-token", "owner-token"]) {
      const result = await invokeJson(handler, "admin-members", {}, {
        authorization: `Bearer ${token}`,
      }, "GET");
      assert(
        result.response.status === 200,
        `${actors[token].role} could not use the member support endpoint`,
      );
      assert(
        Array.isArray(result.payload.members),
        `${actors[token].role} did not receive the member list shape`,
      );
    }
  });
  assertEqual(
    profileReads.toSorted(),
    [
      "/rest/v1/profiles",
      "/rest/v1/orders",
      "/rest/v1/profiles",
      "/rest/v1/orders",
    ].toSorted(),
    "allowed member reads changed",
  );
});

Deno.test("signup, login, and account-assist HTTP endpoints surface DB rate limits before auth work", async () => {
  const cases = [
    {
      edge: "signup-with-login-id",
      scope: "auth_signup",
      body: {
        loginId: "rate.user",
        email: "rate@example.test",
        password: "not-a-real-password",
        captchaToken: "captcha-token-not-evaluated",
        profile: { name: "테스트", phone: "01012345678" },
      },
    },
    {
      edge: "login-with-identifier",
      scope: "auth_login_request",
      body: {
        identifier: "rate@example.test",
        password: "not-a-real-password",
        captchaToken: "captcha-token-not-evaluated",
      },
    },
    {
      edge: "auth-assist",
      scope: "auth_assist",
      body: {
        mode: "find-id",
        name: "테스트",
        phone: "01012345678",
        email: "rate@example.test",
        captchaToken: "captcha-token-not-evaluated",
      },
    },
  ] as const;

  for (const scenario of cases) {
    const scopes: string[] = [];
    const responder = rpcOnlyResponder(async (name, body) => {
      if (name !== "consume_edge_rate_limit_v1") {
        throw new Error(`Auth work continued to RPC ${name}`);
      }
      scopes.push(String(body.p_scope));
      return { allowed: false, retryAfter: 37, remaining: 0 };
    }, async (request) => {
      throw new Error(
        `Auth work continued to HTTP ${request.method} ${request.url}`,
      );
    });
    const handler = await edgeHandler(scenario.edge);
    await withEdgeMocks(responder, async () => {
      const result = await invokeJson(handler, scenario.edge, scenario.body);
      assert(
        result.response.status === 429,
        `${scenario.edge} returned ${result.response.status}`,
      );
      assert(
        result.response.headers.get("retry-after") === "37",
        `${scenario.edge} lost Retry-After`,
      );
      assert(
        result.payload.code === "RATE_LIMITED",
        `${scenario.edge} exposed the wrong rate error`,
      );
    });
    assertEqual(
      scopes,
      [scenario.scope, scenario.scope],
      `${scenario.edge} did not guard IP and subject`,
    );
  }
});
