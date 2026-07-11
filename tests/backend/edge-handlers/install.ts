import { beginCapture } from "./registry.ts";

const name = new URL(import.meta.url).searchParams.get("name") || "";
beginCapture(name);
