export const STATUSES = [
  "processing",
  "needs_review",
  "approved",
  "rejected",
] as const;

export type Status = (typeof STATUSES)[number];

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

export type InvoiceRow = {
  id: number;
  vendor: string;
  invoice_number: string;
  amount_cents: number;
  currency: string;
  invoice_date: string;
  status: Status;
  duplicate_of_id: number | null;
  created_at: string;
  updated_at: string;
};

export type DuplicateOf = {
  id: number;
  vendor: string;
  invoice_number: string;
  status: Status;
};

export type StatusHistoryRow = {
  id: number;
  invoice_id: number;
  from_status: Status | null;
  to_status: Status;
  changed_at: string;
};

export type Invoice = InvoiceRow & {
  duplicate_of: DuplicateOf | null;
  status_history?: StatusHistoryRow[];
};
