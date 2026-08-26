-- Webhook opt-outs are durable suppression records. The free-form message that
-- triggered the suppression is not needed indefinitely and may contain unrelated
-- personal data. Future webhook parsing normalizes these messages before write;
-- this migration minimizes existing webhook-origin reasons as well.
UPDATE "opt_outs"
SET "reason" = 'STOP'
WHERE "source" = 'evolution_webhook'
  AND "reason" IS DISTINCT FROM 'STOP';
