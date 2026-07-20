const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");

const databaseUrl = process.env.DATABASE_URL || "file:./dev.db";
const dbPath = resolveSqlitePath(databaseUrl);
const migrationsDir = path.join(__dirname, "..", "prisma", "migrations");

mkdirSync(path.dirname(dbPath), { recursive: true });

execFileSync("sqlite3", [dbPath], {
  input: 'CREATE TABLE IF NOT EXISTS "_cpm_migrations" ("name" TEXT NOT NULL PRIMARY KEY, "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);\n',
  stdio: ["pipe", "inherit", "inherit"]
});

const customerTableExists = existsSync(dbPath) && query(dbPath, "SELECT name FROM sqlite_master WHERE type='table' AND name='Customer';").trim() === "Customer";
const migrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

let appliedCount = 0;
for (const migration of migrations) {
  if (isApplied(dbPath, migration)) {
    continue;
  }
  if (migration.endsWith("_init") && customerTableExists) {
    markApplied(dbPath, migration);
    continue;
  }
  const migrationPath = path.join(migrationsDir, migration, "migration.sql");
  execFileSync("sqlite3", [dbPath], {
    input: readFileSync(migrationPath, "utf8"),
    stdio: ["pipe", "inherit", "inherit"]
  });
  markApplied(dbPath, migration);
  appliedCount += 1;
}

console.log(appliedCount > 0 ? `SQLite schema updated at ${dbPath}` : `SQLite schema already up to date at ${dbPath}`);

function query(file, sql) {
  return execFileSync("sqlite3", [file, sql], { encoding: "utf8" });
}

function isApplied(file, name) {
  return query(file, `SELECT name FROM "_cpm_migrations" WHERE name='${name.replaceAll("'", "''")}';`).trim() === name;
}

function markApplied(file, name) {
  execFileSync("sqlite3", [file], {
    input: `INSERT OR IGNORE INTO "_cpm_migrations" ("name") VALUES ('${name.replaceAll("'", "''")}');\n`,
    stdio: ["pipe", "inherit", "inherit"]
  });
}

function resolveSqlitePath(url) {
  if (!url.startsWith("file:")) {
    throw new Error("Only SQLite file: DATABASE_URL values are supported by setup-sqlite.js");
  }
  const rawPath = url.replace(/^file:/, "");
  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }
  return path.resolve(__dirname, "..", "prisma", rawPath);
}
