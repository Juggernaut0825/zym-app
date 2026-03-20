import 'dotenv/config';
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { POSTGRES_FOUNDATION_TABLES } from '../src/database/postgres-foundation.js';

interface ExportedTableManifest {
  columns: string[];
  file: string;
  rowCount: number;
}

interface ExportManifest {
  exportedAt: string;
  sqlitePath: string;
  tables: Record<string, ExportedTableManifest>;
}

function parseArgs(argv: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      values.set(current, 'true');
      continue;
    }
    values.set(current, next);
    index += 1;
  }
  return values;
}

function quoteIdentifier(identifier: string): string {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function defaultSqlitePath(): string {
  return path.join(process.cwd(), 'data', 'zym.db');
}

function defaultOutputDir(): string {
  return path.join(process.cwd(), 'data', 'postgres-export');
}

async function ensureCleanDirectory(directory: string): Promise<void> {
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
}

function listExistingTables(db: Database.Database): Set<string> {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function getTableColumns(db: Database.Database, tableName: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sqlitePath = path.resolve(args.get('--sqlite') || defaultSqlitePath());
  const outDir = path.resolve(args.get('--out') || defaultOutputDir());

  const db = new Database(sqlitePath, { readonly: true });
  const existingTables = listExistingTables(db);
  const manifest: ExportManifest = {
    exportedAt: new Date().toISOString(),
    sqlitePath,
    tables: {},
  };

  await ensureCleanDirectory(outDir);

  for (const table of POSTGRES_FOUNDATION_TABLES) {
    if (!existingTables.has(table.name)) {
      throw new Error(`SQLite database is missing expected table "${table.name}"`);
    }

    const columns = getTableColumns(db, table.name);
    const rows = db
      .prepare(`SELECT * FROM ${quoteIdentifier(table.name)} ORDER BY ${table.orderBy}`)
      .all() as Array<Record<string, unknown>>;

    const fileName = `${table.name}.ndjson`;
    const filePath = path.join(outDir, fileName);
    const fileBody = rows.map((row) => JSON.stringify(row)).join('\n');
    await fs.writeFile(filePath, fileBody ? `${fileBody}\n` : '', 'utf8');

    manifest.tables[table.name] = {
      columns,
      file: fileName,
      rowCount: rows.length,
    };
  }

  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`[sqlite-export] wrote ${POSTGRES_FOUNDATION_TABLES.length} tables to ${outDir}`);
}

main().catch((error) => {
  console.error('[sqlite-export] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
