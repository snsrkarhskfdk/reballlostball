try {
  await import("dotenv/config");
} catch (error) {
  if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
}
import { cp, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { injectPublicConfig } from "./public-config.mjs";

await import("./build-check.mjs");

const outputDir = "dist";
const deploymentExclusions = [
  "assets/hero-transition/frames",
  "assets/hero-transition/reball-intro-1.mp4",
  "assets/hero-transition/reball_ball_drop_meta.json",
  "hero/flight/frames",
  "hero/flight/hero_ball_flight_meta.json",
];

function shouldCopyAsset(sourcePath) {
  const normalized = String(sourcePath).replace(/\\/g, "/");
  return !deploymentExclusions.some(
    (entry) => normalized === entry || normalized.endsWith(`/${entry}`) || normalized.includes(`/${entry}/`)
  );
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const file of ["app.js", "styles.css"]) {
  await copyFile(file, `${outputDir}/${file}`);
}
const indexHtml = await readFile("index.html", "utf8");
await writeFile(`${outputDir}/index.html`, injectPublicConfig(indexHtml), "utf8");

for (const optionalFile of ["CNAME", ".nojekyll"]) {
  if (existsSync(optionalFile)) {
    await copyFile(optionalFile, `${outputDir}/${optionalFile}`);
  }
}

await cp("assets", `${outputDir}/assets`, { recursive: true, filter: shouldCopyAsset });
await cp("src/frontend", `${outputDir}/src/frontend`, { recursive: true });
if (existsSync("public")) {
  await cp("public", `${outputDir}/public`, { recursive: true });
}
if (existsSync("hero")) {
  await cp("hero", `${outputDir}/hero`, { recursive: true, filter: shouldCopyAsset });
}

process.stdout.write(`Static output prepared in ${outputDir}\n`);
