# PR27 validation notes

Temporary engineering notes for the pre-beta LLM generation lease.

- Base: `agent/prebeta-agent-daily-budget` at `4f8a811c5817f3a49b73439ee26d7369dad2b09a`.
- Real sending remains disabled.
- No Prisma migration is required: `ConversationMessage` is reused as the persistent generation lease.
- Final CI evidence and manual/infra QA must be copied into `docs/QA_PREBETA_PENDING.md` before this PR is considered closed automatically.
- This temporary note can be removed after the canonical QA document is updated.
