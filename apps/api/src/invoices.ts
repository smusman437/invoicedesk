import type Database from "better-sqlite3";
import { ApiError } from "./errors.js";
import { assertCanTransition } from "./status.js";
import type { Invoice, InvoiceRow, Status, StatusHistoryRow } from "./types.js";

type JoinedRow = InvoiceRow & {
  orig_id: number | null;
  orig_vendor: string | null;
  orig_invoice_number: string | null;
  orig_status: Status | null;
};

const INVOICE_SELECT = `
  SELECT
    i.id,
    i.vendor,
    i.invoice_number,
    i.amount_cents,
    i.currency,
    i.invoice_date,
    i.status,
    i.duplicate_of_id,
    i.created_at,
    i.updated_at,
    o.id AS orig_id,
    o.vendor AS orig_vendor,
    o.invoice_number AS orig_invoice_number,
    o.status AS orig_status
  FROM invoices i
  LEFT JOIN invoices o ON o.id = i.duplicate_of_id
`;

function mapInvoice(row: JoinedRow, history?: StatusHistoryRow[]): Invoice {
  return {
    id: row.id,
    vendor: row.vendor,
    invoice_number: row.invoice_number,
    amount_cents: row.amount_cents,
    currency: row.currency,
    invoice_date: row.invoice_date,
    status: row.status,
    duplicate_of_id: row.duplicate_of_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    duplicate_of:
      row.orig_id != null
        ? {
            id: row.orig_id,
            vendor: row.orig_vendor as string,
            invoice_number: row.orig_invoice_number as string,
            status: row.orig_status as Status,
          }
        : null,
    ...(history ? { status_history: history } : {}),
  };
}

function getRow(db: Database.Database, id: number): JoinedRow | undefined {
  return db.prepare(`${INVOICE_SELECT} WHERE i.id = ?`).get(id) as JoinedRow | undefined;
}

function getHistory(db: Database.Database, invoiceId: number): StatusHistoryRow[] {
  return db
    .prepare(
      `SELECT id, invoice_id, from_status, to_status, changed_at
       FROM status_history
       WHERE invoice_id = ?
       ORDER BY changed_at ASC, id ASC`,
    )
    .all(invoiceId) as StatusHistoryRow[];
}

export function listInvoices(db: Database.Database, status?: Status): Invoice[] {
  const sql = status
    ? `${INVOICE_SELECT} WHERE i.status = ? ORDER BY i.id DESC`
    : `${INVOICE_SELECT} ORDER BY i.id DESC`;
  const rows = (status ? db.prepare(sql).all(status) : db.prepare(sql).all()) as JoinedRow[];
  return rows.map((row) => mapInvoice(row));
}

export function getInvoice(db: Database.Database, id: number): Invoice | null {
  const row = getRow(db, id);
  if (!row) return null;
  return mapInvoice(row, getHistory(db, id));
}

export function updateStatus(db: Database.Database, id: number, to: Status): Invoice {
  const row = getRow(db, id);
  if (!row) {
    throw new ApiError(404, "NOT_FOUND", `Invoice ${id} not found`);
  }

  const original = row.duplicate_of_id != null ? getPlain(db, row.duplicate_of_id) : null;
  assertCanTransition(row, to, original);

  const now = new Date().toISOString();

  // Write the new status and the history row together so a crash cannot
  // leave one without the other.
  const apply = db.transaction(() => {
    db.prepare(
      `UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?`,
    ).run(to, now, id);
    db.prepare(
      `INSERT INTO status_history (invoice_id, from_status, to_status, changed_at)
       VALUES (?, ?, ?, ?)`,
    ).run(id, row.status, to, now);
  });

  apply();

  const updated = getInvoice(db, id);
  if (!updated) {
    throw new ApiError(500, "INTERNAL", "Invoice disappeared after update");
  }
  return updated;
}

function getPlain(db: Database.Database, id: number): InvoiceRow | null {
  const row = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(id) as InvoiceRow | undefined;
  return row ?? null;
}
