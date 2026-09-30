"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// the logs API returns at most this many lines per request
const PAGE_SIZE = 500;

interface LogEntry {
  id: string;
  stream: string;
  content: string;
  timestamp: string;
}

interface LogViewerProps {
  taskId: string;
  isActive: boolean;
}

export function LogViewer({ taskId, isActive }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const taskIdRef = useRef(taskId);
  const lastIdRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);

  const fetchLogs = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      // keep fetching until we've caught up, so long logs aren't cut off
      while (taskIdRef.current === taskId) {
        const params = lastIdRef.current
          ? `?cursor=${encodeURIComponent(lastIdRef.current)}`
          : "";
        const res = await fetch(`/api/tasks/${taskId}/logs${params}`);
        if (!res.ok || taskIdRef.current !== taskId) return;
        const newLogs: LogEntry[] = await res.json();
        if (newLogs.length === 0) return;
        lastIdRef.current = newLogs[newLogs.length - 1].id;
        setLogs((prev) => {
          const existingIds = new Set(prev.map((log) => log.id));
          const dedupedLogs = newLogs.filter(
            (log) => !existingIds.has(log.id)
          );
          if (dedupedLogs.length === 0) return prev;
          return [...prev, ...dedupedLogs];
        });
        if (newLogs.length < PAGE_SIZE) return;
      }
    } catch {
      // fetch failed
    } finally {
      isFetchingRef.current = false;
    }
  }, [taskId]);

  useEffect(() => {
    // Reset on taskId change
    taskIdRef.current = taskId;
    setLogs([]);
    lastIdRef.current = null;
    isFetchingRef.current = false;
    atBottomRef.current = true;
    fetchLogs();
  }, [taskId, fetchLogs]);

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, [isActive, fetchLogs]);

  useEffect(() => {
    // follow new lines, unless the user has scrolled up to read
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [logs]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
  };

  if (logs.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-md border border-border bg-muted/30">
        <span className="text-sm text-muted-foreground/50">No logs yet</span>
      </div>
    );
  }

  return (
    // drag the bottom-right corner to make it taller
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="h-80 min-h-24 resize-y overflow-auto rounded-md border border-border bg-black/50"
    >
      <div className="p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
        {logs.map((log) => (
          <div
            key={log.id}
            className={
              log.stream === "stderr"
                ? "text-red-400"
                : log.stream === "system"
                  ? "text-yellow-400"
                  : "text-green-300"
            }
          >
            <span className="mr-2 text-muted-foreground/40">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            {log.content}
          </div>
        ))}
      </div>
    </div>
  );
}
