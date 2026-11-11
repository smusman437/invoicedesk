import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { buildApp } from "./app.js";
import { openDatabase } from "./db.js";
import type { Invoice } from "./types.js";

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "invoicedesk-"));
  return path.join(dir, "invoices.db");
}

describe("invoices API", () => {
  let dbPath: string;
  let db: Database.Database;
  let app: FastifyInstance;

  beforeEach(async () => {
    dbPath = tempDbPath();
    db = openDatabase(dbPath);
    app = buildApp(db);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    if (db.open) db.close();
  });

  it("seeds exactly 5 invoices with exactly 1 duplicate", async () => {
    const res = await app.inject({ method: "GET", url: "/api/invoices" });
    expect(res.statusCode).toBe(200);
    const invoices = res.json<Invoice[]>();
    expect(invoices).toHaveLength(5);
    const duplicates = invoices.filter((inv) => inv.duplicate_of_id != null);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.duplicate_of_id).toBe(1);
    expect(duplicates[0]?.vendor).toBe("Acme Supplies");
    expect(duplicates[0]?.invoice_number).toBe("INV-1042");
  });

  it("lists all invoices", async () => {
    const res = await app.inject({ method: "GET", url: "/api/invoices" });
    expect(res.statusCode).toBe(200);
    const invoices = res.json<Invoice[]>();
    expect(invoices.map((inv) => inv.id)).toEqual([5, 4, 3, 2, 1]);
  });

  it("filters by status", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/invoices?status=processing",
    });
    expect(res.statusCode).toBe(200);
    const invoices = res.json<Invoice[]>();
    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.id).toBe(2);
    expect(invoices[0]?.status).toBe("processing");
  });

  it("rejects an invalid status filter with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/invoices?status=paid",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { code: "INVALID_STATUS" },
    });
  });

  it("gets an invoice by id including history", async () => {
    const res = await app.inject({ method: "GET", url: "/api/invoices/1" });
    expect(res.statusCode).toBe(200);
    const invoice = res.json<Invoice>();
    expect(invoice.vendor).toBe("Acme Supplies");
    expect(invoice.status).toBe("needs_review");
    expect(invoice.status_history?.length).toBeGreaterThanOrEqual(1);
    expect(invoice.status_history?.[0]?.from_status).toBeNull();
    expect(invoice.status_history?.[0]?.to_status).toBe("needs_review");
  });

  it("returns 404 for a missing invoice", async () => {
    const res = await app.inject({ method: "GET", url: "/api/invoices/99" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });

  it("applies a valid transition", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/invoices/2",
      payload: { status: "needs_review" },
    });
    expect(res.statusCode).toBe(200);
    const invoice = res.json<Invoice>();
    expect(invoice.status).toBe("needs_review");
    const last = invoice.status_history?.at(-1);
    expect(last?.from_status).toBe("processing");
    expect(last?.to_status).toBe("needs_review");
  });

  it("refuses an illegal transition with 409 and allowed list", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/invoices/3",
      payload: { status: "rejected" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      error: {
        code: "ILLEGAL_TRANSITION",
        from: "approved",
        to: "rejected",
        allowed: [],
      },
    });
  });

  it("refuses a same-status PATCH with 409", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/invoices/1",
      payload: { status: "needs_review" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      error: {
        code: "SAME_STATUS",
        from: "needs_review",
        to: "needs_review",
        allowed: ["approved", "rejected"],
      },
    });
  });

  it("rejects a bad body with 400", async () => {
    const missing = await app.inject({
      method: "PATCH",
      url: "/api/invoices/1",
      payload: {},
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toMatchObject({ error: { code: "INVALID_BODY" } });

    const unknown = await app.inject({
      method: "PATCH",
      url: "/api/invoices/1",
      payload: { status: "paid" },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toMatchObject({ error: { code: "INVALID_BODY" } });
  });

  it("blocks approving a duplicate while the original is needs_review, and allows reject", async () => {
    const blocked = await app.inject({
      method: "PATCH",
      url: "/api/invoices/5",
      payload: { status: "approved" },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({
      error: {
        code: "DUPLICATE_APPROVAL_BLOCKED",
        allowed: ["rejected"],
      },
    });

    const rejected = await app.inject({
      method: "PATCH",
      url: "/api/invoices/5",
      payload: { status: "rejected" },
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json<Invoice>().status).toBe("rejected");
  });

  it("also blocks duplicate approval when the original is already approved", async () => {
    const approveOriginal = await app.inject({
      method: "PATCH",
      url: "/api/invoices/1",
      payload: { status: "approved" },
    });
    expect(approveOriginal.statusCode).toBe(200);

    const blocked = await app.inject({
      method: "PATCH",
      url: "/api/invoices/5",
      payload: { status: "approved" },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({
      error: { code: "DUPLICATE_APPROVAL_BLOCKED" },
    });
  });

  it("restores the five sample invoices", async () => {
    const rejected = await app.inject({
      method: "PATCH",
      url: "/api/invoices/5",
      payload: { status: "rejected" },
    });
    expect(rejected.statusCode).toBe(200);

    const reset = await app.inject({ method: "POST", url: "/api/reset-samples" });
    expect(reset.statusCode).toBe(200);
    const invoices = reset.json<Invoice[]>();
    expect(invoices).toHaveLength(5);

    const byId = Object.fromEntries(invoices.map((inv) => [inv.id, inv]));
    expect(byId[2]?.status).toBe("processing");
    expect(byId[5]?.status).toBe("needs_review");
    expect(byId[5]?.duplicate_of_id).toBe(1);
  });
});

describe("invoice persistence", () => {
  it("survives closing and reopening the database", async () => {
    const dbPath = tempDbPath();
    const db = openDatabase(dbPath);
    const app = buildApp(db);
    await app.ready();

    const patched = await app.inject({
      method: "PATCH",
      url: "/api/invoices/2",
      payload: { status: "needs_review" },
    });
    expect(patched.statusCode).toBe(200);

    await app.close();
    db.close();

    const reopened = openDatabase(dbPath);
    const app2 = buildApp(reopened);
    await app2.ready();

    const res = await app2.inject({ method: "GET", url: "/api/invoices/2" });
    expect(res.statusCode).toBe(200);
    const invoice = res.json<Invoice>();
    expect(invoice.status).toBe("needs_review");
    expect(invoice.status_history?.some((h) => h.to_status === "needs_review")).toBe(true);

    await app2.close();
    reopened.close();
  });
});
