# Servonas AI Assistant — Phase 1

The Assistant entry point is `processAssistantInput()` in `lib/assistant/orchestrator.ts`. Web, future microphone/AirPods, and future Twilio transcript adapters should authenticate a user, resolve a trusted workspace context, and call that entry point with the appropriate channel. Provider code never receives Supabase credentials and cannot execute SQL.

## Security model

- The model can select only one of ten allow-listed tools.
- Tool arguments are untrusted and validated server-side.
- Business and user identity come from the authenticated server context, never model arguments.
- Reads and mutations include the trusted `business_id`; RLS independently enforces membership.
- Mutations reuse existing permissions and scheduling/payment primitives.
- Marking an invoice paid creates a persisted confirmation request. Confirmation is atomically claimed and the payment RPC uses the action ID as its idempotency key.
- Mutation audit records identify actor, tenant, conversation, channel, action, and affected state.

## Configuration

Set `OPENAI_API_KEY` server-side. `OPENAI_ASSISTANT_MODEL` is optional and defaults to `gpt-4.1-mini`. Without an API key, a small deterministic fallback still supports today/tomorrow schedule, customer search, and outstanding-invoice questions.

## Future voice and Twilio extension

Do not put phone logic into tools. A future Twilio or speech-to-text adapter should produce authenticated text and pass it to `processAssistantInput({context,conversationId,channel,input})`. Confirmation remains a separate authenticated action, regardless of input channel.
