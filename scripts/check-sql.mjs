import { readFile } from "node:fs/promises";
import { parse } from "pgsql-parser";

const migrationPath = "supabase/migrations/20260710173448_production_commerce_security.sql";
const source = await readFile(migrationPath, "utf8");
const tree = await parse(source);
const statementCount = tree?.stmts?.length;

if (!Number.isSafeInteger(statementCount) || statementCount < 1) {
  throw new Error(`SQL parser returned no statements for ${migrationPath}`);
}

process.stdout.write(`SQL parser checked ${statementCount} statements\n`);
