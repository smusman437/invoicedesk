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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json()) as T | ApiErrorBody;
  if (!res.ok) {
    throw new ApiError(res.status, data as ApiErrorBody);
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
    return request<Invoice[]>("/api/reset-samples", { method: "POST" });
  },
};
