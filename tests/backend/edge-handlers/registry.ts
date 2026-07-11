import type { EdgeHandler } from "../edge-handler-harness.ts";

const mutableDeno = Deno as unknown as {
  serve: (...args: unknown[]) => unknown;
};
const originalServe = mutableDeno.serve;
const captured = new Map<string, EdgeHandler>();
let activeName = "";

export function beginCapture(name: string): void {
  if (!name || activeName) {
    throw new Error(`Invalid nested Edge capture: ${activeName} -> ${name}`);
  }
  activeName = name;
  mutableDeno.serve = (...args: unknown[]) => {
    const candidate = typeof args[0] === "function" ? args[0] : args[1];
    if (typeof candidate !== "function") {
      throw new Error(`No Edge handler was passed by ${activeName}`);
    }
    captured.set(activeName, candidate as EdgeHandler);
    return {
      finished: Promise.resolve(),
      shutdown: () => Promise.resolve(),
      ref: () => undefined,
      unref: () => undefined,
    };
  };
}

export function finishCapture(name: string): EdgeHandler {
  mutableDeno.serve = originalServe;
  const handler = captured.get(name);
  captured.delete(name);
  activeName = "";
  if (!handler) throw new Error(`Edge handler was not captured: ${name}`);
  return handler;
}
