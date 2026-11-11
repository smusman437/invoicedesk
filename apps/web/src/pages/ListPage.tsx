import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api";
import { formatDate, formatMoney, statusLabel } from "../format";
import type { Invoice, Status } from "../types";

type TabId = "processing" | "needs_review" | "closed";

const TABS: { id: TabId; label: string; statuses: Status[] }[] = [
  { id: "processing", label: "Processing", statuses: ["processing"] },
  { id: "needs_review", label: "Needs review", statuses: ["needs_review"] },
  { id: "closed", label: "Approved / Rejected", statuses: ["approved", "rejected"] },
];

export function ListPage() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tab, setTab] = useState<TabId>("needs_review");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .list()
      .then((rows) => {
        if (!cancelled) {
          setInvoices(rows);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load invoices");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const map: Record<TabId, number> = { processing: 0, needs_review: 0, closed: 0 };
    for (const invoice of invoices) {
      if (invoice.status === "processing") map.processing += 1;
      else if (invoice.status === "needs_review") map.needs_review += 1;
      else map.closed += 1;
    }
    return map;
  }, [invoices]);

  const visible = useMemo(() => {
    const statuses = TABS.find((t) => t.id === tab)?.statuses ?? [];
    return invoices.filter((invoice) => statuses.includes(invoice.status));
  }, [invoices, tab]);

  async function restoreSamples() {
    setResetting(true);
    setError(null);
    try {
      const rows = await api.resetSamples();
      setInvoices(rows);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Could not restore the sample invoices");
    } finally {
      setResetting(false);
    }
  }

  const emptyCopy =
    tab === "processing"
      ? "Nothing sitting in processing. New bills start here; once intake is done they move to Needs review."
      : tab === "needs_review"
        ? "This queue is clear. Anything you already decided on is in Approved / Rejected."
        : "No approved or rejected invoices yet.";

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h1>Invoices</h1>
          <p className="lede">Click a row to open it. Approve or reject from there.</p>
        </div>
        <button type="button" className="btn ghost" disabled={resetting} onClick={() => void restoreSamples()}>
          {resetting ? "Restoring…" : "Restore samples"}
        </button>
      </div>

      <div className="tabs" role="tablist" aria-label="Invoice status">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "tab active" : "tab"}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            <span className="count">{counts[item.id]}</span>
          </button>
        ))}
      </div>

      {error && <div className="banner error">{error}</div>}
      {loading && <p className="muted">Loading invoices…</p>}

      {!loading && !error && visible.length === 0 && (
        <div className="empty">
          <p>{emptyCopy}</p>
          <p>This demo does not have an “add invoice” form. Restore samples puts the original five bills back, including the duplicate.</p>
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div className="table-wrap">
          <table className="invoice-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Invoice #</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Status</th>
                <th>Duplicate</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((invoice) => (
                <tr
                  key={invoice.id}
                  tabIndex={0}
                  onClick={() => navigate(`/invoices/${invoice.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/invoices/${invoice.id}`);
                    }
                  }}
                >
                  <td>{invoice.vendor}</td>
                  <td className="mono">{invoice.invoice_number}</td>
                  <td>{formatMoney(invoice.amount_cents, invoice.currency)}</td>
                  <td>{formatDate(invoice.invoice_date)}</td>
                  <td>
                    <span className={`pill pill-${invoice.status}`}>{statusLabel(invoice.status)}</span>
                  </td>
                  <td>
                    {invoice.duplicate_of ? (
                      <Link
                        className="dup-badge"
                        to={`/invoices/${invoice.duplicate_of.id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        Possible duplicate of #{invoice.duplicate_of.id}
                      </Link>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
