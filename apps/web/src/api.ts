import type { ApiErrorBody, Invoice, Status } from "./types";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public body: ApiErrorBody,
  ) {
    super(body.error.message);
    this.name = "ApiError";
  }
}

function readErrorMessage(status: number, data: unknown): string {
  if (data && typeof data === "object") {
    const record = data as { error?: unknown; message?: unknown };
    if (record.error && typeof record.error === "object" && "message" in record.error) {
      return String((record.error as { message: unknown }).message);
    }
    if (typeof record.error === "string") return record.error;
    if (typeof record.message === "string") return record.message;
  }
  return `Request failed (${status})`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text.slice(0, 200) || `Request failed (${res.status})`);
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, {
      error: { code: "REQUEST_FAILED", message: readErrorMessage(res.status, data) },
    });
  }
  return data as T;
}

export const api = {
  list(): Promise<Invoice[]> {
    return request<Invoice[]>("/api/invoices");
  },
  get(id: number): Promise<Invoice> {
    return request<Invoice>(`/api/invoices/${id}`);
  },
  patchStatus(id: number, status: Status): Promise<Invoice> {
    return request<Invoice>(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  },
  resetSamples(): Promise<Invoice[]> {
    return request<Invoice[]>("/api/reset-samples", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  },
};
