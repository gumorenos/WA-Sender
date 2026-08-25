# Pre-LLM generation lease invariants

The auto-reply path uses a short PostgreSQL transaction to create a persistent `assistant_generating` marker before any LLM request starts.

Invariants:

1. Conversation advisory lock is acquired before evaluating/creating a generation lease.
2. LLM daily budget reservation is made in the same transaction as lease creation.
3. At most one fresh `assistant_generating` row is allowed by service logic per conversation.
4. No database transaction remains open while the external LLM request runs.
5. A successful LLM result can start Evolution only by promoting the same lease row to `assistant_pending` while holding the conversation lock again.
6. Handoff, opt-out, agent disablement, rate limit, unknown provider state, another provider call, or provider daily budget exhaustion release the generation lease instead of sending.
7. A stale generation lease is safe to abandon because no Evolution request has started at that phase.
8. A process that finishes after its lease was reclaimed receives `GENERATION_LEASE_LOST` and cannot start Evolution.
9. `assistant_generating` and `assistant_not_sent` are excluded from normal LLM history because history includes only `user` and `assistant` roles.
10. `REAL_SENDING_ENABLED=false` and `AGENT_REAL_REPLY_ENABLED=false` remain unchanged for pre-beta.
