import { readdir, readFile } from "node:fs/promises";
import { parse } from "pgsql-parser";

const migrationDir = "supabase/migrations";
const migrationNames = (await readdir(migrationDir))
  .filter((name) => name.endsWith(".sql"))
  .sort();
let statementCount = 0;

if (!migrationNames.length) throw new Error("No production repair migrations were found");

for (const name of migrationNames) {
  const migrationPath = `${migrationDir}/${name}`;
  const tree = await parse(await readFile(migrationPath, "utf8"));
  const fileStatements = tree?.stmts?.length;
  if (!Number.isSafeInteger(fileStatements) || fileStatements < 1) {
    throw new Error(`SQL parser returned no statements for ${migrationPath}`);
  }
  statementCount += fileStatements;
}

process.stdout.write(`SQL parser checked ${statementCount} statements across ${migrationNames.length} production migrations\n`);
