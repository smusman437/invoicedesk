import { ApiError } from "./errors.js";
import type { InvoiceRow, Status } from "./types.js";

/**
 * Status is a state machine, not a free-form field.
 *
 * processing   — still being ingested. Reviewers cannot send work back here.
 * needs_review — the only place a person decides.
 * approved / rejected — done. Reopening would need a who/why we do not store.
 *
 * PATCH to the same status is a 409: if the client thought it changed
 * something, a quiet 200 would hide the bug.
 */
export const ALLOWED_TRANSITIONS: Record<Status, readonly Status[]> = {
  processing: ["needs_review"],
  needs_review: ["approved", "rejected"],
  approved: [],
  rejected: [],
};

export function allowedTransitions(from: Status): Status[] {
  return [...ALLOWED_TRANSITIONS[from]];
}

export function isAllowedTransition(from: Status, to: Status): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Same vendor + invoice number (trimmed, case-insensitive) counts as a
 * duplicate. Amount is ignored: a corrected total is still the same bill.
 * We flag it instead of auto-rejecting — typos happen. We do block
 * approving the copy while the original is still in review or already
 * approved, because that is how you pay twice.
 */
export function canApproveDuplicate(original: InvoiceRow | null): boolean {
  if (!original) return true;
  return original.status !== "approved" && original.status !== "needs_review";
}

export function currentlyAllowed(invoice: InvoiceRow, original: InvoiceRow | null): Status[] {
  return allowedTransitions(invoice.status).filter((to) => {
    if (to !== "approved" || invoice.duplicate_of_id == null) return true;
    return canApproveDuplicate(original);
  });
}

export function assertCanTransition(
  invoice: InvoiceRow,
  to: Status,
  original: InvoiceRow | null,
): void {
  const allowed = currentlyAllowed(invoice, original);

  if (invoice.status === to) {
    throw new ApiError(409, "SAME_STATUS", `Invoice is already ${to}`, {
      from: invoice.status,
      to,
      allowed,
    });
  }

  if (!isAllowedTransition(invoice.status, to)) {
    throw new ApiError(
      409,
      "ILLEGAL_TRANSITION",
      `Cannot transition from ${invoice.status} to ${to}`,
      { from: invoice.status, to, allowed },
    );
  }

  if (to === "approved" && invoice.duplicate_of_id != null && !canApproveDuplicate(original)) {
    const orig = original as InvoiceRow;
    throw new ApiError(
      409,
      "DUPLICATE_APPROVAL_BLOCKED",
      `Cannot approve invoice #${invoice.id}; it is a possible duplicate of #${orig.id} which is still ${orig.status}`,
      { from: invoice.status, to, allowed },
    );
  }
}
