import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(process.cwd());
const safetyRoot = resolve(
  process.env.REBALL_SAFETY_ROOT ?? "D:/Backup/리볼_로스트볼_safety_20260711_005440"
);
const referenceRoot = resolve(
  process.env.REBALL_GITHUB_REFERENCE ?? "D:/Backup/reball_github_reference_20260711_005734"
);
const outputPath = join(root, "docs/repair/00_LOCAL_VS_GITHUB_DIFF.md");

for (const path of [safetyRoot, referenceRoot]) {
  if (!existsSync(path)) throw new Error(`Required baseline path not found: ${path}`);
}

async function walk(base, directory = base) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "ko"))) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(base, absolute)));
    else if (entry.isFile()) result.push(relative(base, absolute).replaceAll("\\", "/"));
  }
  return result;
}

function git(args) {
  return execFileSync("git", ["-c", `safe.directory=${referenceRoot}`, ...args], {
    cwd: referenceRoot,
    encoding: "utf8",
  }).trim();
}

function sha256(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex").toUpperCase()));
  });
}

function markdownPath(path) {
  return path.replaceAll("|", "\\|");
}

function topGroup(path) {
  return path.includes("/") ? path.split("/", 1)[0] : "(root)";
}

function groupCounts(paths) {
  const counts = new Map();
  for (const path of paths) counts.set(topGroup(path), (counts.get(topGroup(path)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
}

const localPaths = await walk(safetyRoot);
const githubPaths = git(["ls-files"]).split(/\r?\n/u).filter(Boolean);
const localSet = new Set(localPaths.map((path) => path.toLowerCase()));
const githubSet = new Set(githubPaths.map((path) => path.toLowerCase()));
const localOnly = localPaths.filter((path) => !githubSet.has(path.toLowerCase()));
const githubOnly = githubPaths.filter((path) => !localSet.has(path.toLowerCase()));
const shared = localPaths.filter((path) => githubSet.has(path.toLowerCase()));
const different = [];
const identical = [];

for (const path of shared) {
  const localHash = await sha256(join(safetyRoot, path));
  const githubHash = await sha256(join(referenceRoot, path));
  (localHash === githubHash ? identical : different).push({ path, localHash, githubHash });
}

const lines = [
  "# 00 Local vs GitHub Diff",
  "",
  "> 비교 기준: 소스 복원 전 확정 원본 안전 복사본과 GitHub `main`을 파일 경로 기준으로 비교했다. GitHub 파일은 누락 소스 복원용으로만 사용했으며 같은 경로의 로컬 파일은 덮어쓰지 않았다.",
  "",
  "## 기준선",
  "",
  `- 로컬 확정 원본: \`${safetyRoot.replaceAll("\\", "/")}\``,
  `- GitHub 참조: \`snsrkarhskfdk/reballlostball@${git(["rev-parse", "HEAD"])}\``,
  `- 로컬 파일: ${localPaths.length}`,
  `- GitHub 추적 파일: ${githubPaths.length}`,
  `- 로컬 전용: ${localOnly.length}`,
  `- GitHub 전용: ${githubOnly.length}`,
  `- 서로 다른 공유 경로: ${different.length}`,
  `- 동일 공유 경로: ${identical.length}`,
  "",
  "## 판단",
  "",
  "- 확정 원본에는 앱 소스가 없고 약 4GB의 Blender·이미지·영상·Figma 참고 자산만 있었다.",
  "- GitHub `main`에는 정적 SPA와 Supabase migration/Edge Function이 있었으므로 220개 GitHub 전용 파일만 확정 원본에 복원했다.",
  "- 유일한 공유 경로 `package.json`은 로컬 `dotenv` 의존성과 GitHub 실행 스크립트를 병합 대상으로 두고 어느 한쪽으로 덮어쓰지 않았다.",
  "- 로컬 전용 원본·자산은 삭제·재인코딩·Git 일괄 추가하지 않는다.",
  "",
  "## 로컬 전용 그룹",
  "",
  "| 그룹 | 파일 수 |",
  "|---|---:|",
  ...groupCounts(localOnly).map(([group, count]) => `| ${markdownPath(group)} | ${count} |`),
  "",
  "## 서로 다른 파일",
  "",
  "| 경로 | 로컬 SHA-256 | GitHub SHA-256 | 처리 |",
  "|---|---|---|---|",
  ...different.map(({ path, localHash, githubHash }) =>
    `| ${markdownPath(path)} | \`${localHash}\` | \`${githubHash}\` | 병합 |`
  ),
  "",
  "## 로컬 전용 최신 파일 — 전체 목록",
  "",
  "| 경로 | 크기(bytes) | 수정 시각 |",
  "|---|---:|---|",
];

for (const path of localOnly) {
  const metadata = await stat(join(safetyRoot, path));
  lines.push(`| ${markdownPath(path)} | ${metadata.size} | ${metadata.mtime.toISOString()} |`);
}

lines.push(
  "",
  "## GitHub 전용 파일 — 전체 목록",
  "",
  "| 경로 | 크기(bytes) |",
  "|---|---:|"
);
for (const path of githubOnly) {
  const metadata = await stat(join(referenceRoot, path));
  lines.push(`| ${markdownPath(path)} | ${metadata.size} |`);
}

lines.push(
  "",
  "## 중복·미사용 후보",
  "",
  "- `app-current.js`, `index-current.html`: 개발 서버가 현재 이 복제본을 우선 로드해 배포 엔트리와 동작이 갈린다. 병합 확인 전 삭제하지 않고 `DELETION_CANDIDATES.md`에서 추적한다.",
  "- `해안.html`, `해안_files/**`: Meshy.ai 저장 페이지로 쇼핑몰 런타임과 무관하지만 원본 자산이므로 삭제하지 않는다.",
  "- `asset/`: 빈 로컬 폴더이며 GitHub의 `assets/`와 이름이 다르다. 삭제하지 않는다.",
  ""
);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, lines.join("\n"), "utf8");
process.stdout.write(`Diff report written: ${outputPath}\n`);
