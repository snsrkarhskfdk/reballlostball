export type EdgeHandler = (request: Request) => Response | Promise<Response>;

type JsonResult = {
  status?: number;
  body?: unknown;
  headers?: HeadersInit;
};

export async function invokeJson(
  handler: EdgeHandler,
  path: string,
  body: Record<string, unknown>,
  headers: HeadersInit = {},
  method = "POST",
): Promise<{ response: Response; payload: Record<string, unknown> }> {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("content-type", "application/json");
  if (!requestHeaders.has("origin")) {
    requestHeaders.set("origin", "http://localhost:3000");
  }
  if (!requestHeaders.has("x-forwarded-for")) {
    requestHeaders.set("x-forwarded-for", "203.0.113.10");
  }
  const response = await handler(
    new Request(`https://edge.test/${path.replace(/^\/+/, "")}`, {
      method,
      headers: requestHeaders,
      body: method === "GET" || method === "HEAD"
        ? undefined
        : JSON.stringify(body),
    }),
  );
  const payload = await response.json().catch(() => ({})) as Record<
    string,
    unknown
  >;
  return { response, payload };
}

export async function withEnvironment<T>(
  values: Record<string, string | null>,
  run: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(values)) {
    previous.set(name, Deno.env.get(name));
    if (value == null) Deno.env.delete(name);
    else Deno.env.set(name, value);
  }
  try {
    return await run();
  } finally {
    for (const [name, value] of previous) {
      if (value == null) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
}

export async function withFetchMock<T>(
  responder: (request: Request) => Response | Promise<Response>,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request && init === undefined
      ? input
      : new Request(input, init);
    return Promise.resolve(responder(request));
  }) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

export function jsonResult(result: JsonResult | unknown): Response {
  const normalized = result && typeof result === "object" &&
      ("body" in result || "headers" in result ||
        ("status" in result &&
          typeof (result as { status?: unknown }).status === "number"))
    ? result as JsonResult
    : { body: result };
  return new Response(JSON.stringify(normalized.body ?? null), {
    status: normalized.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(normalized.headers || {}),
    },
  });
}

export function supabaseRpcName(request: Request): string | null {
  const match = new URL(request.url).pathname.match(
    /^\/rest\/v1\/rpc\/([a-z0-9_]+)$/,
  );
  return match?.[1] ?? null;
}

export async function requestJson(
  request: Request,
): Promise<Record<string, unknown>> {
  return await request.clone().json().catch(() => ({})) as Record<
    string,
    unknown
  >;
}
