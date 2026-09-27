"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sendNotification } from "@/lib/notifications";
import type { Task } from "@/generated/prisma/client";

export function useEventSource() {
  const queryClient = useQueryClient();
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let disposed = false;

    function connect() {
      if (disposed) return;
      es = new EventSource("/api/events");

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "task:updated") {
            // Snapshot previous tasks to detect status changes
            const prevTasks =
              queryClient.getQueryData<Task[]>(["tasks"]) ?? [];
            const prevTask = prevTasks.find(
              (t) => t.id === data.taskId
            );

            queryClient.invalidateQueries({ queryKey: ["tasks"] });
            queryClient.invalidateQueries({ queryKey: ["analytics"] });
            queryClient.invalidateQueries({ queryKey: ["feedback", data.taskId] });

            // Send notification on completion or failure
            if (prevTask && prevTask.status === "in_progress") {
              // Fetch updated task to check new status
              fetch(`/api/tasks/${data.taskId}`)
                .then((r) => r.ok ? r.json() : null)
                .then((updated: Task | null) => {
                  if (!updated) return;
                  if (updated.status === "done") {
                    sendNotification("Task Completed", {
                      body: updated.title,
                      tag: `task-${updated.id}`,
                    });
                  } else if (updated.status === "failed") {
                    sendNotification("Task Failed", {
                      body: `${updated.title}: ${updated.error || "Unknown error"}`,
                      tag: `task-${updated.id}`,
                    });
                  }
                })
                .catch(() => {});
            }
          }
          if (data.type === "dispatcher:status") {
            queryClient.invalidateQueries({ queryKey: ["dispatcher"] });
          }
          if (data.type === "runners:updated") {
            queryClient.invalidateQueries({ queryKey: ["runners"] });
            queryClient.invalidateQueries({ queryKey: ["dispatcher"] });
          }
          if (data.type === "memory:updated") {
            queryClient.invalidateQueries({ queryKey: ["memory"] });
          }
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        es?.close();
        if (!disposed) {
          retryTimeoutRef.current = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      disposed = true;
      es?.close();
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [queryClient]);
}
