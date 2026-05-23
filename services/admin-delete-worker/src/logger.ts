import pino from 'pino'

/**
 * Structured JSON logging. Each log line is one JSON object on stdout —
 * trivial to ingest into journalctl, docker logs, Loki, Axiom, or
 * `jq` ad hoc. Level threshold via LOG_LEVEL env (default 'info').
 *
 * Convention: always pass an object as the first arg with stable keys,
 * and the human-readable message as the second arg:
 *
 *   logger.info({ job_key, account_id }, 'claimed job')
 *
 * That way later you can grep / Loki-filter by structured fields.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: {
    worker: 'admin-delete-worker',
    host: process.env.WORKER_HOST_LABEL || undefined,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})
