"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TaskCardDetail } from "./TaskCardDetail";
import { ElapsedTime } from "./ElapsedTime";
import {
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  STATUS_COLORS,
  TaskStatus,
} from "@/lib/types";
import { tagColor } from "@/lib/tag-colors";
import { useTasksQuery } from "@/hooks/useTasksQuery";
import type { Task } from "@/generated/prisma/client";

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const { data: allTasks } = useTasksQuery();

  const tags = useMemo(
    () =>
      task.tags
        ? task.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    [task.tags]
  );

  const isBlocked = useMemo(() => {
    if (!task.dependsOn || !allTasks) return false;
    try {
      const depIds: string[] = JSON.parse(task.dependsOn);
      return depIds.some((id) => {
        const dep = allTasks.find((t) => t.id === id);
        return !dep || dep.status !== "done";
      });
    } catch {
      return false;
    }
  }, [task.dependsOn, allTasks]);

  return (
    <>
      <Card
        className="cursor-pointer gap-0 border-border/50 p-3 transition-colors hover:border-border"
        onClick={() => setDetailOpen(true)}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium leading-snug">{task.title}</h3>
          <Badge
            variant="outline"
            className={`shrink-0 text-[10px] ${PRIORITY_COLORS[task.priority]}`}
          >
            {PRIORITY_LABELS[task.priority]}
          </Badge>
        </div>

        {task.description && (
          <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
            {task.description}
          </p>
        )}

        {tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tagColor(tag)}`}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center gap-2">
          <Badge
            variant="secondary"
            className={`text-[10px] ${STATUS_COLORS[task.status]}`}
          >
            {task.status === "in_progress" ? "Running" : task.status}
          </Badge>

          {isBlocked && (
            <Badge variant="outline" className="text-[10px] border-orange-500/30 bg-orange-500/10 text-orange-400">
              Blocked
            </Badge>
          )}

          {task.resumeNote && task.status !== TaskStatus.DONE && (
            <Badge
              variant="outline"
              className="text-[10px] border-blue-500/30 bg-blue-500/10 text-blue-400"
              title="An earlier attempt stopped before finishing (out of turns or usage); the next one continues from its progress"
            >
              Saved progress
            </Badge>
          )}

          {task.scheduledFor && (
            <Badge variant="outline" className="text-[10px] border-blue-500/30 bg-blue-500/10 text-blue-400">
              Scheduled
            </Badge>
          )}

          {task.recurring && (
            <Badge variant="outline" className="text-[10px] border-purple-500/30 bg-purple-500/10 text-purple-400">
              Recurring
            </Badge>
          )}

          {task.model && (
            <span className="text-[10px] text-muted-foreground capitalize">
              {task.model}
            </span>
          )}

          {task.status === TaskStatus.IN_PROGRESS && task.startedAt && (
            <span className="text-[10px] text-muted-foreground">
              <ElapsedTime start={new Date(task.startedAt)} />
            </span>
          )}

          {task.runnerName && task.status !== TaskStatus.TODO && task.status !== TaskStatus.READY && (
            <span
              className="min-w-0 truncate text-[10px] text-muted-foreground"
              title={`Agent: ${task.runnerName}`}
            >
              by {task.runnerName}
            </span>
          )}

          {task.status === TaskStatus.FAILED && task.error && (
            <span className="truncate text-[10px] text-red-400">
              {task.error}
            </span>
          )}

          {task.retryCount > 0 && (
            <span className="text-[10px] text-muted-foreground">
              retry {task.retryCount}/{task.maxRetries}
            </span>
          )}
        </div>
      </Card>

      <TaskCardDetail
        task={task}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  );
}
