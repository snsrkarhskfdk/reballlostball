import { readFileSync } from "node:fs";

const requiredFiles = ["dist/index.html", "dist/store-manager.html", "dist/robots.txt", "dist/sitemap.xml", "dist/404.html"];
for (const file of requiredFiles) readFileSync(file);

const index = readFileSync("dist/index.html", "utf8");
if (!index.includes('rel="canonical" href="https://reballlostball.com/"')) throw new Error("canonical missing");
if (!index.includes("runtime/release-closure.mjs")) throw new Error("release closure runtime missing");

const manager = readFileSync("dist/store-manager.html", "utf8");
const pagerIndex = manager.indexOf("store-manager-pagination.mjs");
const managerIndex = manager.indexOf("/store-manager.mjs");
if (pagerIndex < 0 || managerIndex < 0 || pagerIndex > managerIndex) throw new Error("store manager pagination must load before manager runtime");

const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
if (vercel.rewrites.some((rule) => rule.source === "/(.*)" && rule.destination === "/index.html")) {
  throw new Error("catch-all SPA rewrite reintroduced");
}

process.stdout.write("Release static smoke passed\n");
