import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

const source = readFileSync(new URL("../../src/frontend/admin/store-manager-pagination.mjs", import.meta.url), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness() {
  const requests = [], events = [];
  let visibleScope = "orders";
  const context = createContext({
    URL, Request, Response, AbortController, DOMException, setTimeout, clearTimeout,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    MutationObserver: class { observe() {} },
    location: { origin: "https://shop.example" },
    document: {
      readyState: "loading", documentElement: {}, addEventListener() {},
      querySelector(selector) {
        const scope = selector.match(/^\[data-panel="(orders|shipping|returns)"\]$/)?.[1];
        return scope ? { hidden: scope !== visibleScope, querySelector: () => null } : null;
      },
    },
    window: { addEventListener() {}, dispatchEvent: (event) => events.push(event.detail) },
    fetch: (url) => new Promise((resolve, reject) => requests.push({ url, resolve, reject })),
  });
  runInContext(source, context);
  return {
    requests, events,
    read: () => context.fetch("https://shop.example/functions/v1/admin-console?view=orders"),
    show: (scope) => { visibleScope = scope; },
  };
}

function response(marker, page = 1) {
  return new Response(JSON.stringify({ orders: [{ marker }], page, pageSize: 50, hasMore: false }), {
    headers: { "content-type": "application/json" },
  });
}

test("three overlapping order reads all settle on the newest request", async () => {
  const h = harness();
  const a = h.read(), b = h.read();
  h.requests[0].resolve(response("A", 1));
  await flush(); // A is now waiting for B.
  const c = h.read();
  h.requests[2].resolve(response("C", 3));
  assert.equal((await (await c).json()).orders[0].marker, "C");
  h.requests[1].resolve(response("B", 2));
  assert.equal((await (await a).json()).orders[0].marker, "C");
  assert.equal((await (await b).json()).orders[0].marker, "C");
  assert.equal(h.events.at(-1).page, 3);
});

test("a request superseded while its JSON body is pending cannot publish old pagination", async () => {
  const h = harness();
  let body;
  const a = h.read();
  h.requests[0].resolve(new Response(new ReadableStream({ start(controller) { body = controller; } }), {
    headers: { "content-type": "application/json" },
  }));
  await flush();
  const b = h.read();
  h.requests[1].resolve(response("B", 2));
  assert.equal((await (await b).json()).orders[0].marker, "B");
  body.enqueue(new TextEncoder().encode(JSON.stringify({ orders: [{ marker: "A" }], page: 1, pageSize: 50 })));
  body.close();
  assert.equal((await (await a).json()).orders[0].marker, "B");
  assert.equal(h.events.at(-1).page, 2);
});

test("a visible tab change during body reading replaces the result before the new loader starts", async () => {
  const h = harness();
  let body, settled = false;
  const a = h.read();
  a.then(() => { settled = true; }, () => { settled = true; });
  h.requests[0].resolve(new Response(new ReadableStream({ start(controller) { body = controller; } }), {
    headers: { "content-type": "application/json" },
  }));
  await flush();
  h.show("shipping"); // The tab changes before its asynchronous session lookup starts fetch.
  const eventOffset = h.events.length;
  body.enqueue(new TextEncoder().encode(JSON.stringify({ orders: [{ marker: "orders" }], page: 4, pageSize: 50 })));
  body.close();
  for (let attempt = 0; attempt < 10 && h.requests.length < 2 && !settled; attempt++) await flush();
  assert.equal(h.requests.length, 2, "the stale tab response must trigger a read for the visible tab");
  assert.equal(new URL(h.requests[1].url).searchParams.get("scope"), "shipping");
  assert.equal(h.events.slice(eventOffset).some((event) => event.scope === "orders" && !event.pending), false);
  h.requests[1].resolve(response("shipping", 1));
  assert.equal((await (await a).json()).orders[0].marker, "shipping");
  assert.equal(h.events.at(-1).scope, "shipping");
});

test("a stale failed read follows the latest successful dataset", async () => {
  const h = harness();
  const a = h.read(), b = h.read();
  h.requests[1].resolve(response("B", 2));
  assert.equal((await (await b).json()).orders[0].marker, "B");
  h.requests[0].reject(new Error("stale request failed"));
  assert.equal((await (await a).json()).orders[0].marker, "B");
});

test("a tab replacement superseded by another read returns the final tab dataset", async () => {
  const h = harness();
  const a = h.read();
  h.show("shipping");
  h.requests[0].resolve(response("orders"));
  await flush();
  assert.equal(new URL(h.requests[1].url).searchParams.get("scope"), "shipping");
  h.show("returns");
  const c = h.read();
  h.requests[2].resolve(response("returns"));
  assert.equal((await (await c).json()).orders[0].marker, "returns");
  h.requests[1].resolve(response("shipping"));
  assert.equal((await (await a).json()).orders[0].marker, "returns");
});
