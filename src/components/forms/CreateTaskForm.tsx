"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateTask, useSkillsQuery, useBoardsQuery } from "@/hooks/useTasksQuery";
import { toast } from "sonner";
import { describeCron } from "@/lib/cron-parser";
import type { Skill } from "@/generated/prisma/client";

interface CreateTaskFormProps {
  boardId?: string;
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  initialSkill?: Skill | null;
}

export function CreateTaskForm({ boardId, externalOpen, onExternalOpenChange, initialSkill }: CreateTaskFormProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen ?? internalOpen;
  const setOpen = useCallback(
    (v: boolean) => {
      if (onExternalOpenChange) onExternalOpenChange(v);
      else setInternalOpen(v);
    },
    [onExternalOpenChange]
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [priority, setPriority] = useState("2");
  const [tags, setTags] = useState("");
  const [dependsOn, setDependsOn] = useState("");
  const [model, setModel] = useState("");
  const [requireApproval, setRequireApproval] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [recurring, setRecurring] = useState(false);

  const createTask = useCreateTask();
  const { data: skills = [] } = useSkillsQuery();
  const { data: boards = [] } = useBoardsQuery();
  const currentBoard = boards.find((b) => b.id === boardId);
  const boardHasRepo = !!currentBoard?.repoUrl;

  // Apply initial skill when provided
  useEffect(() => {
    if (initialSkill && open) {
      if (!description.trim()) setDescription(initialSkill.prompt);
      if (!criteria.trim()) setCriteria(initialSkill.criteria);
      if (!model && initialSkill.model) setModel(initialSkill.model);
    }
  }, [initialSkill, open]);

  const handleSkillSelect = (skillId: string) => {
    if (skillId === "none") return;
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) return;
    if (!description.trim()) setDescription(skill.prompt);
    if (!criteria.trim()) setCriteria(skill.criteria);
    if (skill.model && !model) setModel(skill.model);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    // Build dependsOn as JSON array string from comma-separated IDs
    const depIds = dependsOn
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const dependsOnJson = depIds.length > 0 ? JSON.stringify(depIds) : "";

    // Append approval:required tag if checkbox is set
    let finalTags = tags.trim();
    if (requireApproval) {
      const tagList = finalTags ? finalTags.split(",").map((t) => t.trim()) : [];
      if (!tagList.includes("approval:required")) {
        tagList.push("approval:required");
      }
      finalTags = tagList.join(", ");
    }

    createTask.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        criteria: criteria.trim(),
        repoUrl: repoUrl.trim(),
        priority: parseInt(priority),
        tags: finalTags,
        dependsOn: dependsOnJson,
        model: model === "default" ? "" : model,
        boardId,
        ...(scheduledFor && { scheduledFor }),
        ...(cronExpression && { cronExpression }),
        ...(recurring && { recurring }),
      },
      {
        onSuccess: () => {
          toast.success("Task created");
          setTitle("");
          setDescription("");
          setCriteria("");
          setRepoUrl("");
          setPriority("2");
          setTags("");
          setDependsOn("");
          setModel("");
          setRequireApproval(false);
          setShowSchedule(false);
          setScheduledFor("");
          setCronExpression("");
          setRecurring(false);
          setOpen(false);
        },
        onError: () => {
          toast.error("Failed to create task");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">+ New Task</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Skill</label>
            <Select onValueChange={handleSkillSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a skill..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No skill</SelectItem>
                {skills.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What should the agent do?"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Description
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed instructions for the agent..."
              rows={3}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Acceptance Criteria
            </label>
            <Textarea
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              placeholder="How to verify the task is complete..."
              rows={2}
            />
          </div>

          {boardHasRepo ? (
            <div className="rounded-md bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                This board is connected to a git repository. The agent will work on its own branch and open a PR.
              </p>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium">
                Repository (optional)
              </label>
              <Input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="Git URL to clone. Empty = a scratch folder on the agent's machine"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">Tags</label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Comma-separated: bug, frontend, urgent"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Depends On
            </label>
            <Input
              value={dependsOn}
              onChange={(e) => setDependsOn(e.target.value)}
              placeholder="Comma-separated task IDs"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">High</SelectItem>
                  <SelectItem value="2">Medium</SelectItem>
                  <SelectItem value="3">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Model</label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="opus">Opus</SelectItem>
                  <SelectItem value="sonnet">Sonnet</SelectItem>
                  <SelectItem value="haiku">Haiku</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="require-approval"
              checked={requireApproval}
              onChange={(e) => setRequireApproval(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <label htmlFor="require-approval" className="text-sm font-medium">
              Require Approval
            </label>
            <span className="text-xs text-muted-foreground">
              (task goes to Review before Done)
            </span>
          </div>

          {/* Schedule Section */}
          <div className="space-y-3 rounded-md border border-border p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-sm font-medium"
              onClick={() => setShowSchedule(!showSchedule)}
            >
              Schedule
              <span className="text-xs text-muted-foreground">
                {showSchedule ? "Hide" : "Show"}
              </span>
            </button>
            {showSchedule && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Run At (one-time)
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Cron Expression (recurring)
                  </label>
                  <Input
                    value={cronExpression}
                    onChange={(e) => {
                      setCronExpression(e.target.value);
                      if (e.target.value.trim()) setRecurring(true);
                    }}
                    placeholder="e.g., 0 9 * * 1"
                    className="text-sm font-mono"
                  />
                  {cronExpression && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {describeCron(cronExpression)}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[
                      { label: "Hourly", value: "0 * * * *" },
                      { label: "Daily 9am", value: "0 9 * * *" },
                      { label: "Weekly Mon", value: "0 9 * * 1" },
                    ].map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted"
                        onClick={() => {
                          setCronExpression(preset.value);
                          setRecurring(true);
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="recurring"
                    checked={recurring}
                    onChange={(e) => setRecurring(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <label htmlFor="recurring" className="text-xs font-medium">
                    Recurring (template task)
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createTask.isPending}>
              {createTask.isPending ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
