"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDispatcherStatus, useToggleQueue } from "@/hooks/useTasksQuery";
import { toast } from "sonner";

interface QueueControlsProps {
  onOpenAgents: () => void;
}

/** Connected-agent count, the Agents panel button, and pause/resume for the queue */
export function QueueControls({ onOpenAgents }: QueueControlsProps) {
  const { data: status } = useDispatcherStatus();
  const toggleQueue = useToggleQueue();

  const handleToggle = () => {
    if (!status) return;
    toggleQueue.mutate(!status.running, {
      onSuccess: () =>
        toast.success(status.running ? "Queue paused: agents won't pick up new tasks" : "Queue resumed"),
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={onOpenAgents} className="gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            status?.onlineRunners ? "bg-green-500" : "bg-muted-foreground/40"
          }`}
        />
        {status ? `${status.onlineRunners} agent${status.onlineRunners === 1 ? "" : "s"} online` : "Agents"}
      </Button>
      {status && (
        <Badge
          variant="outline"
          className={
            status.running
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-amber-500/30 bg-amber-500/10 text-amber-400"
          }
        >
          {status.running ? `${status.activeTasks} running` : "Paused"}
        </Badge>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleToggle}
        disabled={!status || toggleQueue.isPending}
      >
        {status?.running === false ? "Resume Queue" : "Pause Queue"}
      </Button>
    </div>
  );
}
