import { EventEmitter } from "events";

const globalForEvents = globalThis as unknown as {
  eventBus: EventEmitter | undefined;
};

// Always cache on globalThis: background jobs (instrumentation) and the SSE
// route are separate bundles in production and must share one bus.
export const eventBus =
  globalForEvents.eventBus ?? new EventEmitter();

eventBus.setMaxListeners(200);

globalForEvents.eventBus = eventBus;

// Event types
export type SSEEvent =
  | { type: "task:updated"; taskId: string }
  | { type: "task:log"; taskId: string; content: string; stream: string }
  | { type: "dispatcher:status"; running: boolean }
  | { type: "runners:updated" }
  | { type: "memory:updated"; boardId: string };

export function emitEvent(event: SSEEvent) {
  eventBus.emit("sse", event);
}
