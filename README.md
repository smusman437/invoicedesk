# InvoiceDesk

A small web app for a team that reviews invoices. Reviewers work a queue, inspect a possible duplicate, and approve or reject. Status changes are persisted in SQLite and survive a restart.

## Quick start

```bash
npm install
npm start
```

- Web UI: http://localhost:3000
- API: http://localhost:3001

`npm start` runs both processes. Vite proxies `/api` from port 3000 to the Fastify server on 3001.

The first API boot creates `apps/api/data/invoices.db` and seeds five sample invoices. Later boots leave reviewer decisions in place.

## Ports

| Service | Port | How it starts |
| --- | --- | --- |
| Web (Vite + React) | 3000 | `npm run start -w @invoicedesk/web` |
| API (Fastify + SQLite) | 3001 | `npm run start -w @invoicedesk/api` |

## Project structure

```
invoicedesk/
  package.json              npm workspaces + concurrently
  apps/api/                 TypeScript Fastify API
    src/app.ts              HTTP app (injectable in tests)
    src/db.ts               schema, idempotent seed
    src/status.ts           allowed transitions + duplicate rule
    src/invoices.ts         reads/writes, one transaction per PATCH
    src/invoices.test.ts
    data/invoices.db        created at runtime (gitignored)
  apps/web/                 TypeScript React + Vite UI
    src/pages/ListPage.tsx
    src/pages/DetailPage.tsx
```

## Tests

```bash
npm test
```

Vitest drives the Fastify app with `inject()` against a temp SQLite file. Coverage includes list/filter, 400/404, legal and illegal transitions, the duplicate-approval rule, seed shape, and persistence across a DB reopen.

## API reference

Errors always look like:

```json
{ "error": { "code": "ILLEGAL_TRANSITION", "message": "..." } }
```

Conflict responses also include `from`, `to`, and `allowed`.

### List invoices

```bash
curl http://localhost:3001/api/invoices
curl http://localhost:3001/api/invoices?status=needs_review
```

Unknown `?status=` values return **400** `INVALID_STATUS`.

### Get one invoice

```bash
curl http://localhost:3001/api/invoices/5
```

Missing ids return **404**. The payload includes `duplicate_of` (when set) and `status_history`.

### Change status

```bash
# legal: processing -> needs_review (seed invoice #2)
curl -X PATCH http://localhost:3001/api/invoices/2 \
  -H 'Content-Type: application/json' \
  -d '{"status":"needs_review"}'

# illegal: approved is terminal (seed invoice #3)
curl -X PATCH http://localhost:3001/api/invoices/3 \
  -H 'Content-Type: application/json' \
  -d '{"status":"rejected"}'

# duplicate cannot be approved while the original is still live
curl -X PATCH http://localhost:3001/api/invoices/5 \
  -H 'Content-Type: application/json' \
  -d '{"status":"approved"}'
```

| Result | When |
| --- | --- |
| 200 | Legal transition; returns the updated invoice |
| 400 | Missing/invalid body or unknown status |
| 404 | Unknown id |
| 409 | Illegal transition, same-status no-op, or duplicate approval blocked |

## Design notes

### Schema and why

**`invoices.amount_cents`** is an integer. Invoice money is decimal, JavaScript numbers are binary floats, and cents keep `$8,400.50` exact without a decimal type.

**`status_history`** is a separate table because the current status on `invoices` is what the queue filters on, while the detail page needs every transition. PATCH writes both rows in one SQLite transaction so a crash cannot update status without an audit line.

**`duplicate_of_id`** is a nullable self-FK. The duplicate is a real invoice (same vendor + number, seeded as `needs_review`), not a deleted row and not a unique-key failure. Reviewers can still reject it; they cannot silently lose it.

There is intentionally **no unique index** on `(vendor, invoice_number)`. The product requirement is to *show* duplicates, not to refuse the insert.

### Status model

| From | To | Allowed? | Why |
| --- | --- | --- | --- |
| `processing` | `needs_review` | yes | Intake finished; the invoice is ready for a human. |
| `processing` | `approved` / `rejected` | no | Skip-review would bypass the queue this app exists for. |
| `needs_review` | `approved` | yes* | Human accept. |
| `needs_review` | `rejected` | yes | Human decline, including dismissing a duplicate. |
| `approved` or `rejected` | anything | no | Terminal. Re-opening needs identity + reason we do not store. |
| any | same status | no | A no-op PATCH is a client bug; return **409**, not a quiet 200. |
| any | `processing` | no | `processing` is system-owned. Humans cannot push work backwards. |

\*A duplicate (`duplicate_of_id` set) cannot move `needs_review` → `approved` while the original is `needs_review` or `approved` (**409** `DUPLICATE_APPROVAL_BLOCKED`). Paying two live copies of the same vendor + invoice number is the failure mode this rule prevents. The copy can always be rejected.

### How duplicates are handled

Duplicate key = `lower(trim(vendor))` + `trim(invoice_number)`. Amount is not part of the key: a corrected amount on the same invoice number is still the same invoice.

Seed invoice **#5** is a copy of **#1** (Acme Supplies / INV-1042 / $1,250.00). It is stored, flagged, and shown with a **Possible duplicate of #1** badge that links to the original.

We do **not** auto-reject duplicates. OCR noise, a vendor reusing a number, or an amount correction can look identical and still be legitimate. The app forces a human to look, and only blocks the double-pay path.

### What I left out

| Omitted | Why |
| --- | --- |
| Auth | A single-team local demo; adding users would dominate the status/duplicate story. |
| Pagination | Five seeded invoices. A limit/offset API would be speculative. |
| File upload / OCR | Status and duplicates are the product; PDFs are out of scope. |
| Multi-currency FX | `currency` is stored (default USD) but amounts are never converted. |
| Optimistic locking | One reviewer, local SQLite. `updated_at` exists for display, not compare-and-swap. |
| Undo / reopen | Terminal states stay terminal without an identity + reason model. |
| Audit user identity | `status_history` records what changed and when, not who — there is no who. |
