import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type { Status } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_DB_PATH = path.join(__dirname, "..", "data", "invoices.db");

type SeedInvoice = {
  vendor: string;
  invoice_number: string;
  amount_cents: number;
  currency?: string;
  invoice_date: string;
  status: Status;
  duplicateOf?: "original";
};

/**
 * Five invoices, four vendors. #5 shares vendor + invoice_number (and
 * amount) with #1 so the duplicate story is obvious in the UI. The
 * original is seeded as needs_review so Approve on #5 is illegal out of
 * the box — reviewers can still Reject the copy.
 */
const SEED: SeedInvoice[] = [
  {
    vendor: "Acme Supplies",
    invoice_number: "INV-1042",
    amount_cents: 125_000,
    invoice_date: "2026-10-03",
    status: "needs_review",
  },
  {
    vendor: "Northwind Traders",
    invoice_number: "INV-2208",
    amount_cents: 840_050,
    invoice_date: "2026-10-12",
    status: "processing",
  },
  {
    vendor: "Contoso Ltd",
    invoice_number: "INV-3310",
    amount_cents: 319_900,
    invoice_date: "2026-09-28",
    status: "approved",
  },
  {
    vendor: "Fabrikam Inc",
    invoice_number: "INV-4401",
    amount_cents: 64_025,
    invoice_date: "2026-10-20",
    status: "rejected",
  },
  {
    vendor: "Acme Supplies",
    invoice_number: "INV-1042",
    amount_cents: 125_000,
    invoice_date: "2026-10-04",
    status: "needs_review",
    duplicateOf: "original",
  },
];

export function openDatabase(dbPath: string = DEFAULT_DB_PATH): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  migrate(db);
  seedIfEmpty(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY,
      vendor TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      invoice_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN ('processing', 'needs_review', 'approved', 'rejected')
      ),
      duplicate_of_id INTEGER REFERENCES invoices(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS status_history (
      id INTEGER PRIMARY KEY,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id),
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_at TEXT NOT NULL
    );
  `);
}

function seedIfEmpty(db: Database.Database): void {
  const count = db.prepare("SELECT COUNT(*) AS n FROM invoices").get() as { n: number };
  if (count.n > 0) return;

  const now = new Date().toISOString();
  const insertInvoice = db.prepare(`
    INSERT INTO invoices (
      vendor, invoice_number, amount_cents, currency, invoice_date,
      status, duplicate_of_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertHistory = db.prepare(`
    INSERT INTO status_history (invoice_id, from_status, to_status, changed_at)
    VALUES (?, NULL, ?, ?)
  `);

  const seed = db.transaction(() => {
    let originalId: number | null = null;
    for (const row of SEED) {
      const duplicateOfId = row.duplicateOf === "original" ? originalId : null;
      const result = insertInvoice.run(
        row.vendor,
        row.invoice_number,
        row.amount_cents,
        row.currency ?? "USD",
        row.invoice_date,
        row.status,
        duplicateOfId,
        now,
        now,
      );
      const id = Number(result.lastInsertRowid);
      if (originalId == null) originalId = id;
      insertHistory.run(id, row.status, now);
    }
  });

  seed();
}
