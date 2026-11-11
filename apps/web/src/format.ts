import type { Invoice, Status } from "./types";

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function statusLabel(status: Status): string {
  switch (status) {
    case "processing":
      return "Processing";
    case "needs_review":
      return "Needs review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
  }
}

export function canSendToReview(invoice: Invoice): boolean {
  return invoice.status === "processing";
}

export function canApprove(invoice: Invoice): boolean {
  if (invoice.status !== "needs_review") return false;
  const original = invoice.duplicate_of;
  if (!original) return true;
  return original.status !== "approved" && original.status !== "needs_review";
}

export function canReject(invoice: Invoice): boolean {
  return invoice.status === "needs_review";
}
