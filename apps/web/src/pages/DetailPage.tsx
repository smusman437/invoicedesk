import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api";
import {
  canApprove,
  canReject,
  canSendToReview,
  formatDate,
  formatMoney,
  formatTimestamp,
  statusLabel,
} from "../format";
import type { Invoice, Status } from "../types";

export function DetailPage() {
  const { id } = useParams();
  const invoiceId = Number(id);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!Number.isInteger(invoiceId) || invoiceId < 1) {
      setError("Invoice not found");
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get(invoiceId)
      .then((row) => {
        if (!cancelled) {
          setInvoice(row);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setInvoice(null);
          setError(err instanceof ApiError ? err.message : "Could not load invoice");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  async function changeStatus(status: Status) {
    if (!invoice) return;
    setPending(status);
    setActionError(null);
    try {
      const updated = await api.patchStatus(invoice.id, status);
      setInvoice(updated);
    } catch (err: unknown) {
      setActionError(err instanceof ApiError ? err.message : "Could not update status");
    } finally {
      setPending(null);
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <p className="muted">Loading invoice…</p>
      </section>
    );
  }

  if (error || !invoice) {
    return (
      <section className="panel">
        <p className="banner error">{error ?? "Invoice not found"}</p>
        <Link to="/" className="back">
          Back to list
        </Link>
      </section>
    );
  }

  const history = invoice.status_history ?? [];

  return (
    <section className="panel">
      <Link to="/" className="back">
        ← All invoices
      </Link>

      <div className="panel-head">
        <div>
          <p className="eyebrow">Invoice #{invoice.id}</p>
          <h1>{invoice.vendor}</h1>
          <p className="lede mono">{invoice.invoice_number}</p>
        </div>
        <span className={`pill pill-${invoice.status}`}>{statusLabel(invoice.status)}</span>
      </div>

      {invoice.duplicate_of && (
        <p className="dup-callout">
          Possible duplicate of{" "}
          <Link to={`/invoices/${invoice.duplicate_of.id}`}>
            #{invoice.duplicate_of.id} ({invoice.duplicate_of.vendor} {invoice.duplicate_of.invoice_number})
          </Link>
          {invoice.status === "needs_review" &&
          (invoice.duplicate_of.status === "approved" || invoice.duplicate_of.status === "needs_review")
            ? " You can reject this copy, but you cannot approve it while the original is still in review or already approved."
            : null}
        </p>
      )}

      {actionError && <div className="banner error">{actionError}</div>}

      <dl className="facts">
        <div>
          <dt>Amount</dt>
          <dd>{formatMoney(invoice.amount_cents, invoice.currency)}</dd>
        </div>
        <div>
          <dt>Currency</dt>
          <dd>{invoice.currency}</dd>
        </div>
        <div>
          <dt>Invoice date</dt>
          <dd>{formatDate(invoice.invoice_date)}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatTimestamp(invoice.created_at)}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{formatTimestamp(invoice.updated_at)}</dd>
        </div>
      </dl>

      <div className="actions">
        <button
          type="button"
          className="btn ghost"
          disabled={!canSendToReview(invoice) || pending !== null}
          onClick={() => changeStatus("needs_review")}
        >
          {pending === "needs_review" ? "Sending…" : "Send to review"}
        </button>
        <button
          type="button"
          className="btn approve"
          disabled={!canApprove(invoice) || pending !== null}
          onClick={() => changeStatus("approved")}
        >
          {pending === "approved" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          className="btn reject"
          disabled={!canReject(invoice) || pending !== null}
          onClick={() => changeStatus("rejected")}
        >
          {pending === "rejected" ? "Rejecting…" : "Reject"}
        </button>
      </div>

      <section className="history">
        <h2>Status history</h2>
        <ol>
          {history.map((entry) => (
            <li key={entry.id}>
              <span className="history-status">
                {entry.from_status ? statusLabel(entry.from_status) : "Created"}
                {" → "}
                {statusLabel(entry.to_status)}
              </span>
              <span className="muted">{formatTimestamp(entry.changed_at)}</span>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
