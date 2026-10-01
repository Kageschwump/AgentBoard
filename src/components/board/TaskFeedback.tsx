"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddFeedback,
  useDeleteFeedback,
  useFeedbackQuery,
  useRequestChanges,
} from "@/hooks/useTasksQuery";
import { TaskStatus } from "@/lib/types";
import { toast } from "sonner";
import type { Task } from "@/generated/prisma/client";

/** Suggestions (e.g. from playtesting) that an agent picks up when the task is sent back */
export function TaskFeedback({ task }: { task: Task }) {
  const { data: feedback = [] } = useFeedbackQuery(task.id);
  const addFeedback = useAddFeedback(task.id);
  const deleteFeedback = useDeleteFeedback(task.id);
  const requestChanges = useRequestChanges();
  const [draft, setDraft] = useState("");

  const pending = feedback.filter((f) => !f.addressedAt);
  const handled = feedback.filter((f) => f.addressedAt);
  const isRunning = task.status === TaskStatus.IN_PROGRESS;
  const isQueued = task.status === TaskStatus.READY;

  const handleAdd = () => {
    if (!draft.trim()) return;
    addFeedback.mutate(draft.trim(), {
      onSuccess: () => setDraft(""),
      onError: (err) => toast.error(err.message),
    });
  };

  const handleSend = () => {
    requestChanges.mutate(task.id, {
      onSuccess: () =>
        toast.success(
          task.status === TaskStatus.REVIEW
            ? "Sent to the agents. They'll update the same PR."
            : "Sent to the agents"
        ),
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div>
      <h4 className="mb-1 text-xs font-medium text-muted-foreground">Suggestions</h4>

      {feedback.length > 0 && (
        <ul className="mb-2 space-y-1">
          {pending.map((f) => (
            <li
              key={f.id}
              className="group flex items-start gap-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-sm"
            >
              <span className="flex-1 whitespace-pre-wrap">{f.content}</span>
              <button
                className="text-xs text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                onClick={() => deleteFeedback.mutate(f.id)}
                title="Remove suggestion"
              >
                ×
              </button>
            </li>
          ))}
          {handled.map((f) => (
            <li
              key={f.id}
              className="flex items-start gap-2 px-2 py-1 text-sm text-muted-foreground"
              title={`Handled ${new Date(f.addressedAt!).toLocaleString()}`}
            >
              <span className="text-green-500">✓</span>
              <span className="flex-1 whitespace-pre-wrap line-through decoration-muted-foreground/40">
                {f.content}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAdd();
        }}
        placeholder="What should change? e.g. &quot;The buy button is hard to see&quot; or &quot;Equipment should cost more&quot;"
        className="min-h-[60px] text-sm"
        rows={2}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={!draft.trim() || addFeedback.isPending}
        >
          Add suggestion
        </Button>
        {pending.length > 0 && !isRunning && !isQueued && (
          <Button size="sm" onClick={handleSend} disabled={requestChanges.isPending}>
            Send {pending.length} to an agent
          </Button>
        )}
        {pending.length > 0 && (isRunning || isQueued) && (
          <span className="text-xs text-muted-foreground">
            {isRunning
              ? "An agent is working on this now. New suggestions go to the next round."
              : "Queued. The next agent will pick these up."}
          </span>
        )}
      </div>
    </div>
  );
}
