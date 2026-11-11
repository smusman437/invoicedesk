# InvoiceDesk

A small review queue for invoices. Someone on the team opens a bill, looks at it, and approves or rejects it. Status lives in SQLite, so it is still there after a restart.

There is no “create invoice” screen. The app is the queue, not the intake form. Five sample invoices are loaded on first boot (four vendors; one bill is a duplicate of another). If you work through them and the Processing or Needs review tabs go empty, that is expected — the bills moved. **Restore samples** on the list page puts the original five back.

## Quick start

```bash
npm install
npm start
```

- App: http://localhost:3000
- API: http://localhost:3001

One command starts both. The Vite app on 3000 proxies `/api` to the Fastify server on 3001.

The first API boot creates `apps/api/data/invoices.db`. Later boots keep whatever reviewers already decided.

## Ports

| What | Port |
| --- | --- |
| Web (Vite + React) | 3000 |
| API (Fastify + SQLite) | 3001 |

## Project structure

```
invoicedesk/
  package.json              workspaces + the start/test scripts
  apps/api/                 TypeScript Fastify API
    src/app.ts              HTTP app (tests call this, no real port)
    src/db.ts               tables + seed
    src/status.ts           which moves are allowed
    src/invoices.ts         reads/writes; PATCH is one transaction
    src/invoices.test.ts
    data/invoices.db        created at runtime, not in git
  apps/web/                 TypeScript React + Vite
    src/pages/ListPage.tsx
    src/pages/DetailPage.tsx
```

## Tests

```bash
npm test
```

Vitest talks to Fastify with `inject()`, against a temp SQLite file. The suite covers listing, status filters, 400/404, legal and illegal transitions, the duplicate-approval rule, seed shape, persistence after a reopen, and restoring samples.

## API

Errors always look like:

```json
{ "error": { "code": "ILLEGAL_TRANSITION", "message": "..." } }
```

On a 409 the body also has `from`, `to`, and `allowed`.

### List

```bash
curl http://localhost:3001/api/invoices
curl 'http://localhost:3001/api/invoices?status=needs_review'
```

Unknown `?status=` values return **400** `INVALID_STATUS`.

### One invoice

```bash
curl http://localhost:3001/api/invoices/5
```

Missing ids return **404**. The payload includes `duplicate_of` when it is a copy, and `status_history`.

### Change status

```bash
# allowed: processing → needs_review (sample #2)
curl -X PATCH http://localhost:3001/api/invoices/2 \
  -H 'Content-Type: application/json' \
  -d '{"status":"needs_review"}'

# refused: approved is a dead end (sample #3)
curl -X PATCH http://localhost:3001/api/invoices/3 \
  -H 'Content-Type: application/json' \
  -d '{"status":"rejected"}'

# refused: #5 is a copy of #1, and #1 is still in review
curl -X PATCH http://localhost:3001/api/invoices/5 \
  -H 'Content-Type: application/json' \
  -d '{"status":"approved"}'
```

| Status | When |
| --- | --- |
| 200 | Allowed move; body is the updated invoice |
| 400 | Missing/broken body, or a status that does not exist |
| 404 | Unknown id |
| 409 | Illegal move, same-status no-op, or duplicate approval blocked |

### Restore the sample set (demo)

```bash
curl -X POST http://localhost:3001/api/reset-samples
```

This is not part of the invoice API. It wipes reviewer work and reloads the original five bills so a walkthrough can start over.

## Design notes

### Schema, and why it looks like this

**`amount_cents`** is an integer. Invoice money is decimal; JavaScript numbers are not. Storing cents means `$8,400.50` stays exact.

**`status_history`** is its own table. The queue filters on the current status. The detail page needs every move. A PATCH writes both rows in one SQLite transaction, so a crash cannot update the invoice and skip the history (or the other way around).

**`duplicate_of_id`** is a nullable pointer at another invoice. The copy is a real row — same vendor and number, sitting in `needs_review`. We do not delete it, and we do not fail the insert. A reviewer can still reject it.

There is no unique index on `(vendor, invoice_number)` on purpose. The point of the exercise is to *show* a duplicate, not to bounce it at the door.

### Status model

| From | To | Allowed? | Why |
| --- | --- | --- | --- |
| `processing` | `needs_review` | yes | Intake is done; a person can look at it. |
| `processing` | `approved` / `rejected` | no | That would skip the queue this app is for. |
| `needs_review` | `approved` | yes* | A person says pay it. |
| `needs_review` | `rejected` | yes | A person says no — including “this is the copy”. |
| `approved` or `rejected` | anything | no | Done. Reopening would need a who and a why, which we do not store. |
| any | the same status | no | A no-op PATCH is a client bug. Return **409**, not a quiet 200. |
| any | `processing` | no | `processing` belongs to intake. People cannot shove work backwards. |

\*If the invoice is a duplicate, `needs_review` → `approved` is refused while the original is still `needs_review` or already `approved` (**409** `DUPLICATE_APPROVAL_BLOCKED`). Two live copies of the same vendor + number is how you pay twice. Rejecting the copy is always fine.

### Duplicates

Two invoices match when `lower(trim(vendor))` and `trim(invoice_number)` are the same. Amount is not part of that key — a corrected total is still the same bill.

Sample **#5** is a copy of **#1** (Acme Supplies / INV-1042 / $1,250.00). It stays in the list with a **Possible duplicate of #1** badge that links to the original.

We do not auto-reject copies. A vendor reuse, an OCR typo, or an amount correction can look identical and still be real. Someone has to look. The only hard stop is the double-pay path.

### What I left out

| Left out | Why |
| --- | --- |
| Creating invoices | The brief was a review queue on seeded data, not an intake product. Restore samples if the tabs go empty. |
| Auth | One person, on a laptop. Users would drown out the status/duplicate story. |
| Pagination | Five invoices. A page API would be guessing. |
| File upload / OCR | The work here is status and duplicates, not PDFs. |
| Currency conversion | `currency` is stored (USD by default). We never convert. |
| Optimistic locking | One reviewer, local SQLite. `updated_at` is for display. |
| Undo / reopen | Terminal stays terminal without a who/why. |
| Who changed it | History records what moved and when. There is no logged-in user. |
