"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { COLUMN_TITLES, STATUS_COLORS, TaskStatusType } from "@/lib/types";
import type { Task } from "@/generated/prisma/client";

/** Reads a task's dependsOn column (a JSON array of task IDs) */
export function parseDependsOn(dependsOn: string): string[] {
  if (!dependsOn) return [];
  try {
    const ids = JSON.parse(dependsOn);
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function serializeDependsOn(ids: string[]): string {
  return ids.length > 0 ? JSON.stringify(ids) : "";
}

/** IDs of every task that waits on `taskId`, directly or through other tasks */
function dependentsOf(taskId: string, tasks: Task[]): Set<string> {
  const found = new Set<string>();
  const queue = [taskId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const t of tasks) {
      if (!found.has(t.id) && parseDependsOn(t.dependsOn).includes(id)) {
        found.add(t.id);
        queue.push(t.id);
      }
    }
  }
  return found;
}

interface DependsOnPickerProps {
  tasks: Task[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** The task being edited; it and the tasks waiting on it can't be picked */
  taskId?: string;
}

export function DependsOnPicker({ tasks, value, onChange, taskId }: DependsOnPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const candidates = useMemo(() => {
    const blocked = taskId ? dependentsOf(taskId, tasks) : new Set<string>();
    const q = query.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        t.status !== "done" &&
        !t.recurring &&
        t.id !== taskId &&
        !blocked.has(t.id) &&
        !value.includes(t.id) &&
        (!q || t.title.toLowerCase().includes(q))
    );
  }, [tasks, value, taskId, query]);

  const add = (id: string) => {
    onChange([...value, id]);
    setQuery("");
    setHighlight(0);
  };

  const remove = (id: string) => onChange(value.filter((v) => v !== id));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.max(0, Math.min(h + 1, candidates.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      // Never submit the surrounding form from here
      e.preventDefault();
      const pick = candidates[highlight];
      if (open && pick) add(pick.id);
    } else if (e.key === "Escape" && open) {
      // Close the list without closing the dialog
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "Backspace" && !query && value.length > 0) {
      remove(value[value.length - 1]);
    }
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="space-y-1">
          {value.map((id) => {
            const dep = tasks.find((t) => t.id === id);
            return (
              <div
                key={id}
                className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1 text-xs"
              >
                <Badge
                  variant="secondary"
                  className={`text-[10px] ${dep ? STATUS_COLORS[dep.status] : ""}`}
                >
                  {dep ? COLUMN_TITLES[dep.status as TaskStatusType] ?? dep.status : "missing"}
                </Badge>
                <span className={`flex-1 truncate ${dep ? "" : "font-mono text-muted-foreground"}`}>
                  {dep ? dep.title : id}
                </span>
                <button
                  type="button"
                  onClick={() => remove(id)}
                  className="px-1 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove dependency ${dep?.title ?? id}`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder={value.length > 0 ? "Add another task..." : "Search open tasks..."}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />

      {open && (
        <div role="listbox" className="max-h-48 overflow-y-auto rounded-md border border-border">
          {candidates.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {query.trim() ? "No open task matches" : "No open tasks to wait for"}
            </p>
          ) : (
            candidates.map((t, i) => (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={i === highlight}
                // mousedown fires before the input's blur, so the click still lands
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(t.id);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                  i === highlight ? "bg-muted" : ""
                }`}
              >
                <Badge variant="secondary" className={`text-[10px] ${STATUS_COLORS[t.status]}`}>
                  {COLUMN_TITLES[t.status as TaskStatusType] ?? t.status}
                </Badge>
                <span className="truncate">{t.title}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
