import { cp, copyFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

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

for (const file of ["index.html", "app.js", "styles.css"]) {
  await copyFile(file, `${outputDir}/${file}`);
}

for (const optionalFile of ["CNAME", ".nojekyll"]) {
  if (existsSync(optionalFile)) {
    await copyFile(optionalFile, `${outputDir}/${optionalFile}`);
  }
}

await cp("assets", `${outputDir}/assets`, { recursive: true, filter: shouldCopyAsset });
if (existsSync("hero")) {
  await cp("hero", `${outputDir}/hero`, { recursive: true, filter: shouldCopyAsset });
}

process.stdout.write(`Static output prepared in ${outputDir}\n`);
