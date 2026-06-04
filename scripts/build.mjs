import { cp, copyFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

await import("./build-check.mjs");

const outputDir = "dist";

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

await cp("assets", `${outputDir}/assets`, { recursive: true });

process.stdout.write(`Static output prepared in ${outputDir}\n`);
