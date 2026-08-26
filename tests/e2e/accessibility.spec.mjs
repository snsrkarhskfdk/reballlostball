import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");

for (const [viewportName, viewport] of [
  ["desktop", { width: 1280, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  for (const route of ["/#/", "/#/product/titleist-pro-v1-v1x-lostball", "/#/cart", "/#/login", "/#/admin"]) {
    test(`no serious accessibility violations on ${route} (${viewportName})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(route);
      await page.addScriptTag({ path: axePath });
      const results = await page.evaluate(async () =>
        globalThis.axe.run(document, {
          resultTypes: ["violations"],
        })
      );
      const serious = results.violations.filter((item) =>
        ["serious", "critical"].includes(item.impact)
      );
      expect(
        serious.map((item) => ({
          id: item.id,
          impact: item.impact,
          nodes: item.nodes.map((node) => ({
            target: node.target,
            html: node.html,
            failureSummary: node.failureSummary,
          })),
        }))
      ).toEqual([]);
    });
  }
}
