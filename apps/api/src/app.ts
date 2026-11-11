import Fastify, { type FastifyError } from "fastify";
import type Database from "better-sqlite3";
import { ApiError } from "./errors.js";
import { resetSamples } from "./db.js";
import { getInvoice, listInvoices, updateStatus } from "./invoices.js";
import { isStatus } from "./types.js";

export function buildApp(db: Database.Database, opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false });

  app.setErrorHandler((err: FastifyError | Error, _request, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.statusCode).send(err.toBody());
    }

    const fastifyErr = err as FastifyError;
    if (fastifyErr.statusCode === 400 || err instanceof SyntaxError) {
      return reply.status(400).send({
        error: {
          code: "INVALID_BODY",
          message: "Request body must be valid JSON with a status field",
        },
      });
    }

    app.log.error(err);
    return reply.status(500).send({
      error: { code: "INTERNAL", message: "Internal server error" },
    });
  });

  app.get("/api/invoices", (request) => {
    const { status } = request.query as { status?: string };
    if (status != null && status !== "") {
      if (!isStatus(status)) {
        throw new ApiError(400, "INVALID_STATUS", `Unknown status '${status}'`);
      }
      return listInvoices(db, status);
    }
    return listInvoices(db);
  });

  app.get("/api/invoices/:id", (request) => {
    const id = Number.parseInt((request.params as { id: string }).id, 10);
    if (!Number.isInteger(id) || id < 1) {
      throw new ApiError(404, "NOT_FOUND", "Invoice not found");
    }
    const invoice = getInvoice(db, id);
    if (!invoice) {
      throw new ApiError(404, "NOT_FOUND", `Invoice ${id} not found`);
    }
    return invoice;
  });

  app.patch("/api/invoices/:id", (request) => {
    const id = Number.parseInt((request.params as { id: string }).id, 10);
    if (!Number.isInteger(id) || id < 1) {
      throw new ApiError(404, "NOT_FOUND", "Invoice not found");
    }

    const body = request.body;
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError(400, "INVALID_BODY", "Body must be a JSON object with a status field");
    }

    const status = (body as { status?: unknown }).status;
    if (typeof status !== "string" || status.trim() === "") {
      throw new ApiError(400, "INVALID_BODY", "Missing or invalid status field");
    }
    if (!isStatus(status)) {
      throw new ApiError(400, "INVALID_BODY", `Unknown status '${status}'`);
    }

    return updateStatus(db, id, status);
  });

  // Not part of the invoice API. Puts the five sample invoices back after
  // a walkthrough so the Processing / Needs review tabs are not stuck empty.
  app.post("/api/reset-samples", () => {
    resetSamples(db);
    return listInvoices(db);
  });

  return app;
}

export type App = ReturnType<typeof buildApp>;
