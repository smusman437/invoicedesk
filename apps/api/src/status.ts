import { ApiError } from "./errors.js";
import type { InvoiceRow, Status } from "./types.js";

/**
 * Status is a small state machine, not a free-form field.
 *
 * processing  — intake / extraction. System-owned; reviewers cannot send
 *               work back here (no undo in this slice).
 * needs_review — the only human decision point.
 * approved / rejected — terminal. Paying twice, or quietly reopening a
 *               rejection, needs a richer audit model than we have.
 *
 * Same-status PATCH is refused even though it is a no-op: a client that
 * thinks it is changing something should get a conflict, not a silent 200.
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
 * Duplicate key is lower(trim(vendor)) + trim(invoice_number). Amount is
 * not part of the key (a corrected amount on the same invoice # is still
 * the same invoice). We never auto-reject: OCR / vendor typos happen, so
 * a human has to look. We *do* block approval while the original is still
 * live (needs_review) or already approved — that is the double-pay case.
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
