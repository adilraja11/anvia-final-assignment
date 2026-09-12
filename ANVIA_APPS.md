# Anvia Full-Stack Applications

> Current stable v1 implementation context for server streaming and React chat. Updated 2026-08-23.

Keep agents, provider credentials, tools, memory, retrieval, observers, continuations, and access
control on the server. Send only the reviewed Client Protocol to the browser.

```text
@anvia/react-ui or app components
        â†“ @anvia/react controller
@anvia/client HTTP transport
        â†“ ClientStreamRequest over JSONL or SSE
authenticated server route
        â†“ @anvia/client event projection
server-side Agent stream
        â†“ @anvia/server Response
```

## Packages

```sh
pnpm add @anvia/core @anvia/client @anvia/server
pnpm add @anvia/react @anvia/react-ui react react-dom
```

- `@anvia/client` defines browser-safe request, event, message, and transport contracts.
- `@anvia/server` frames client events as a Fetch `Response` using JSONL or SSE.
- `@anvia/react` owns chat and completion controllers, cancellation, resumption, and interactions.
- `@anvia/react-ui` provides strictly headless primitives and ships no CSS.
- `@anvia/cli` can copy editable shadcn/Tailwind components into the application.

## Server route

The route is framework-independent because it uses standard `Request`, `Response`, and Web Streams.
Authenticate, rate-limit, and authorize before starting model work.

```ts
import { agentToClientStream, parseClientStreamRequest } from '@anvia/client'
import { createClientStreamResponse } from '@anvia/server'
import { supportAgent } from './support-agent'

export async function POST(request: Request) {
  const body = parseClientStreamRequest(await request.json())
  if (body.type !== 'messages') {
    return new Response('Interaction responses are not enabled', { status: 400 })
  }

  return createClientStreamResponse({
    events: agentToClientStream({
      events: supportAgent.stream({ messages: body.messages }),
      ...(body.metadata === undefined ? {} : { metadata: body.metadata }),
    }),
    format: 'jsonl',
  })
}
```

Do not serialize raw runtime events directly. Projection is the security and compatibility boundary
where private errors, reasoning, provider payloads, tool inputs, and tool outputs are omitted or
mapped to intentional public events.

## React controller

```tsx
import { createHttpClientTransport } from '@anvia/client'
import { useChat } from '@anvia/react'
import { useState } from 'react'

const transport = createHttpClientTransport({ endpoint: '/api/chat', format: 'jsonl' })

export function Chat() {
  const chat = useChat({ transport })
  const [input, setInput] = useState('')

  return (
    <form onSubmit={(event) => {
      event.preventDefault()
      void chat.sendMessage({ text: input })
      setInput('')
    }}>
      {chat.messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part) => part.type === 'text' ? part.text : null)}
        </div>
      ))}
      <input value={input} onChange={(event) => setInput(event.target.value)} />
      <button disabled={chat.status === 'submitted' || chat.status === 'streaming'}>Send</button>
      <button type="button" onClick={chat.stop}>Stop</button>
    </form>
  )
}
```

The same `format` must be configured at both ends. JSONL is the default; use SSE when existing
infrastructure requires it. Test proxy buffering, idle timeouts, disconnect cancellation, and
maximum request duration in the deployed environment.

## Headless UI or editable components

Use the CLI when the application wants an editable starting point:

```sh
pnpm dlx @anvia/cli init
pnpm dlx @anvia/cli add chat
```

Or compose headless primitives directly:

```tsx
import { ChatProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive } from '@anvia/react-ui'

export function ChatView({ chat }) {
  return (
    <ChatProvider controller={chat}>
      <ThreadPrimitive.Root className="chat-thread">
        <ThreadPrimitive.Viewport>
          <ThreadPrimitive.Messages>
            <MessagePrimitive.Root className="chat-message">
              <MessagePrimitive.Content>
                <MessagePrimitive.Parts />
              </MessagePrimitive.Content>
            </MessagePrimitive.Root>
          </ThreadPrimitive.Messages>
        </ThreadPrimitive.Viewport>
        <ComposerPrimitive.Root className="chat-composer">
          <ComposerPrimitive.Input placeholder="Send a message..." />
          <ComposerPrimitive.Stop>Stop</ComposerPrimitive.Stop>
          <ComposerPrimitive.Submit>Send</ComposerPrimitive.Submit>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </ChatProvider>
  )
}
```

There is no package stylesheet and no `data-anvia-*` styling contract. Use application classes,
`asChild`, ARIA, `data-state`, and `data-role`. CLI output belongs to the application and can be
edited freely; `@anvia/react-ui` remains the behavior and accessibility foundation.

## Interactions and resumability

Client Protocol v3 represents approval and question responses as `interaction_response` requests.
The browser may hold the public interaction ID, but the server must map it to a protected
continuation and verify actor, tenant, expiry, response type, and claim state. Side-effecting tools
must remain idempotent because retries and reconnects cannot create an exactly-once guarantee.

For resumable streams, use durable shared storage across replicas, authorize both thread and stream
ownership, and apply retention/deletion policy separately to messages, uploads, stream envelopes,
memory, and telemetry.

## Production checklist

- Validate actual request bytes, message/part counts, text lengths, metadata, and attachments.
- Treat browser history as untrusted content, not identity or system instruction.
- Enforce same-origin or narrow credentialed CORS and HTTPS.
- Ensure authentication failures cause zero provider and tool calls.
- Sanitize public errors and keep credentials and observability payloads server-side.
- Test aborts, reconnects, duplicate interaction decisions, cross-tenant IDs, and proxy buffering.

## Canonical documentation

- Client protocol: https://docs.anvia.dev/packages/client/
- Server: https://docs.anvia.dev/packages/server/
- React controllers: https://docs.anvia.dev/packages/react/
- React UI: https://docs.anvia.dev/packages/react-ui/
- CLI: https://docs.anvia.dev/packages/cli/
- Secure streaming example: https://docs.anvia.dev/examples/applications/streaming-react-chat
- Resumable streams: https://docs.anvia.dev/sdk/streaming/resumable-streams
- Agent interactions: https://docs.anvia.dev/sdk/agents/interactions