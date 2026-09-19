# Platform valuation chat integration contract

Status: proposed; not implemented.

## Purpose and boundary

Add a Bahasa Indonesia follow-up chat to the persistent successful-result page at
`/result/$valuationId`. The chat helps the user understand the existing recommendation, market
range, confidence, evidence, pros, cons, and limitations. It does not perform another valuation.

The server contract is
[the valuation chat API contract](../../../api/docs/contracts/valuation-chat-api.md). The result
screen continues to follow [valuation-integration.md](valuation-integration.md). This document
defines only browser behavior and presentation.

## Availability

Show the chat only when all of the following are true:

- the ID-based valuation read completed successfully;
- `valuation.state === "COMPLETED"`;
- `result.status === "VALUATED"`; and
- the runtime is the local API integration that implements the chat contract.

Do not show or enable chat for mock results, queued or running valuations, unsupported categories,
missing information, insufficient evidence, service failure, expired results, or unavailable API
integration. Do not simulate chat or substitute canned answers when the server or model fails.

The current API remains local-demo infrastructure. The UI must retain its local/API labelling and
must not imply that valuation chat is public-safe until authentication and owner-scoped reads exist.

## Browser trust boundary

The browser sends only route identifiers and user chat input. It must not serialize the displayed
valuation result, evidence, system instructions, model selection, tools, provider settings, or
grounding context into the chat request.

The server reloads and validates the authoritative valuation snapshot for every turn. The UI renders
only projected Client Protocol events and never receives raw runtime events, reasoning, tool data,
prompts, memory rows, private errors, or credentials.

The route `valuationId` and returned `sessionId` remain untrusted identifiers. Client-side checks
improve UX but are not authorization.

## Platform gateway

Keep valuation-chat HTTP and protocol details outside route and presentation components. Add a
focused gateway with operations equivalent to:

```ts
type ValuationChatSession = {
	id: string;
	valuationId: string;
	createdAt: string;
	expiresAt: string;
};

type ValuationChatHistory = {
	session: ValuationChatSession;
	messages: ClientMessage[];
};

type ValuationChatGateway = {
	createOrRecoverSession(
		valuationId: string,
		signal?: AbortSignal,
	): Promise<ValuationChatSession>;
	readSession(
		valuationId: string,
		sessionId: string,
		signal?: AbortSignal,
	): Promise<ValuationChatHistory>;
	deleteSession(
		valuationId: string,
		sessionId: string,
		signal?: AbortSignal,
	): Promise<void>;
	createTransport(
		valuationId: string,
		sessionId: string,
	): ClientTransport;
};
```

Use relative `/api` paths through the existing Vite proxy. Do not add a `VITE_*` server URL or
expose credentials. Configure `format: "jsonl"` to match the server and validate every decoded
non-stream response before exposing it to components.

## Session lifecycle

Chat is lazy. Do not create or recover a session while the valuation is still loading or merely
because a result card rendered. Initialize it when the user opens the chat or uses a suggested
question. Session creation itself performs no model call.

Once initialized:

1. retain the returned session ID in component state;
2. read and hydrate its projected message history before enabling the composer;
3. create an Anvia HTTP transport scoped to that valuation/session pair;
4. reuse the same session for every turn and for retry after an uncertain session-create response;
5. recover the server's single session again after a page refresh; and
6. stop active browser work on route exit without claiming that server history was deleted.

The route URL remains `/result/$valuationId`; do not add `sessionId` to the address bar. The server
owns the one-session-per-valuation recovery behavior.

## Chat presentation

Place a dedicated section after the persisted result explanation and required disclosures. Keep the
accepted-evidence panel separately visible; chat must not replace evidence transparency.

Recommended persistent copy:

- heading: **"Tanya tentang hasil ini"**;
- description: **"AI menjelaskan hasil valuasi yang sudah dihitung sistem. Jawaban tidak mengubah
  rekomendasi harga dan tidak melakukan pencarian marketplace baru."**;
- composer label: **"Pertanyaan tentang hasil valuasi"**;
- placeholder: **"Contoh: Kenapa rekomendasinya berada di angka ini?"**; and
- clear action: **"Hapus percakapan"**.

Suggested questions may be local UI controls, for example:

- `Kenapa harga rekomendasi berbeda dari rentang pasar?`
- `Apa arti tingkat keyakinan hasil ini?`
- `Keterbatasan apa yang perlu saya perhatikan?`

Selecting one sends exactly that visible text as a normal user message. Suggested questions cannot
carry hidden instructions or valuation data.

Render text parts only in the MVP. Do not render HTML returned by the model, tool controls,
attachments, hidden reasoning, or arbitrary links. If a later contract intentionally exposes safe
sources, add a typed renderer rather than linkifying free-form model text.

## Controller behavior

Use `@anvia/react` `useChat` with the scoped JSONL transport and hydrate it from the validated
history response. Maintain one controller per session.

- Disable send while status is submitted or streaming, while history is loading, or when input is
  empty.
- Provide a visible stop control during streaming. Stop means cancel the current response, not
  delete the conversation or valuation.
- Clear the composer only after submission is accepted by the controller.
- Auto-scroll only when the user is already near the end; do not steal their reading position.
- Keep partial assistant text visible if cancellation occurs, following the protocol's terminal
  state.
- Do not automatically resend a user message after an ambiguous network failure. Offer an explicit
  retry that makes possible duplication clear, or restore history first.
- Prevent double submit in the component in addition to the server's active-turn claim.

## Loading, empty, and error states

The chat has distinct states:

| State | Required behavior |
| --- | --- |
| Closed | Show the chat introduction and an action to open it; make no session request |
| Creating | Disable controls and announce `Menyiapkan percakapan…` |
| Restoring | Disable the composer and announce `Memuat percakapan…` |
| Empty | Show the explanation and optional suggested questions |
| Submitted | Show the user message and an accessible waiting state |
| Streaming | Incrementally render text and expose `Hentikan jawaban` |
| Cancelled | Preserve history and allow another deliberate message |
| Rate limited | Explain the chat limit without affecting the valuation result |
| Unavailable | Keep the result visible and show a retry for chat only |
| Expired or inaccessible | Disable chat and explain that the saved result or session is unavailable |

A chat error must never replace, hide, or invalidate an already rendered valuation. Keep result and
evidence errors independent from chat errors. Never navigate back to creation solely because chat
failed.

Map safe server codes to intentional Bahasa Indonesia copy. Do not display raw response bodies,
stack traces, protocol frames, or private model errors.

## Accessibility and responsive behavior

- Use a labelled region with a visible heading for the chat.
- Render the message list as a semantic log with polite live updates that do not re-announce the
  entire transcript for every streamed token.
- Associate the composer label and error text programmatically; preserve a visible focus indicator.
- After send, keep focus in the composer unless validation fails. After session creation or retry,
  move focus only when it helps the user continue deliberately.
- Make stop, retry, suggested-question, and clear controls keyboard accessible with explicit button
  types.
- Require confirmation before clearing a non-empty conversation, then return focus to the chat open
  control or composer.
- On small screens, keep the composer reachable without covering price, disclosure, or evidence
  content. Do not create a nested full-page scroll trap.
- Respect reduced-motion preferences and avoid token-by-token layout shifts.

## Required disclosures and answer expectations

The result page's existing disclosures remain authoritative and visible outside chat. The assistant
may explain them but cannot weaken or replace them:

- the estimate covers item price only;
- Blibli values are advertised asking prices;
- the result does not verify authenticity, ownership, transaction safety, or hidden physical
  condition; and
- a new valuation is required when product identity or condition materially changes.

The UI must not label chat answers as a new valuation, professional appraisal, guaranteed selling
price, or verified product assessment.

## Analytics and privacy

Permitted UI analytics are limited to operational events such as chat opened, session restored,
message submitted, response completed, response cancelled, safe failure category, and latency.
Never include user message text, assistant text, product description, evidence titles or URLs,
valuation grounding, credentials, or protocol frames.

## Public release blockers

Do not enable the chat outside controlled local development until the API authenticates and
authorizes valuation/session ownership, production CORS is narrow, chat abuse limits and retention
are verified, deployed JSONL streaming is tested, and privacy-safe analytics and tracing are
confirmed.
