export const STATUSES = [
  "processing",
  "needs_review",
  "approved",
  "rejected",
] as const;

export type Status = (typeof STATUSES)[number];

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

export type Invoice = {
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
  duplicate_of: DuplicateOf | null;
  status_history?: StatusHistoryRow[];
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    allowed?: Status[];
    from?: Status;
    to?: Status;
  };
};
