"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useBoardsQuery,
  useCreateBoard,
  useUpdateBoard,
  useDeleteBoard,
} from "@/hooks/useTasksQuery";
import { toast } from "sonner";

interface BoardSelectorProps {
  boardId: string;
  onBoardChange: (id: string) => void;
}

export function BoardSelector({ boardId, onBoardChange }: BoardSelectorProps) {
  const { data: boards = [] } = useBoardsQuery();
  const createBoard = useCreateBoard();
  const updateBoard = useUpdateBoard();
  const deleteBoard = useDeleteBoard();
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRepoUrl, setNewRepoUrl] = useState("");
  const [newBaseBranch, setNewBaseBranch] = useState("main");
  const [newGitProvider, setNewGitProvider] = useState("");
  const [editRepoUrl, setEditRepoUrl] = useState("");
  const [editBaseBranch, setEditBaseBranch] = useState("main");
  const [editGitProvider, setEditGitProvider] = useState("");
  const [editMaxTurns, setEditMaxTurns] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const currentBoard = boards.find((b) => b.id === boardId);
  const displayName = currentBoard?.name || "Default Board";

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createBoard.mutate(
      {
        name: newName.trim(),
        repoUrl: newRepoUrl.trim(),
        baseBranch: newBaseBranch.trim() || "main",
        gitProvider: newGitProvider,
      },
      {
        onSuccess: (board) => {
          toast.success(`Board "${board.name}" created`);
          onBoardChange(board.id);
          setNewName("");
          setNewRepoUrl("");
          setNewBaseBranch("main");
          setNewGitProvider("");
          setCreateOpen(false);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const handleOpenSettings = () => {
    if (currentBoard) {
      setEditRepoUrl(currentBoard.repoUrl || "");
      setEditBaseBranch(currentBoard.baseBranch || "main");
      setEditGitProvider(currentBoard.gitProvider || "");
      setEditMaxTurns(currentBoard.maxTurns ? String(currentBoard.maxTurns) : "");
    }
    setSettingsOpen(true);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateBoard.mutate(
      {
        id: boardId,
        repoUrl: editRepoUrl.trim(),
        baseBranch: editBaseBranch.trim() || "main",
        gitProvider: editGitProvider,
        maxTurns: Math.min(1000, Math.max(0, parseInt(editMaxTurns, 10) || 0)),
      },
      {
        onSuccess: () => {
          toast.success("Board settings updated");
          setSettingsOpen(false);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const handleDelete = (id: string) => {
    deleteBoard.mutate(id, {
      onSuccess: () => {
        toast.success("Board deleted");
        if (boardId === id) onBoardChange("default");
        setDeleteConfirm(null);
      },
      onError: (err) => {
        toast.error(err.message);
        setDeleteConfirm(null);
      },
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            {displayName}
            {currentBoard?.repoUrl && (
              <span className="ml-1 text-[10px] text-muted-foreground" title="Git-connected board">
                [git]
              </span>
            )}
            <span className="text-xs text-muted-foreground">&#x25BC;</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {boards.map((board) => (
            <DropdownMenuItem
              key={board.id}
              className="flex items-center justify-between"
              onSelect={() => onBoardChange(board.id)}
            >
              <span className={board.id === boardId ? "font-semibold" : ""}>
                {board.name}
                {board.repoUrl && (
                  <span className="ml-1 text-[10px] text-muted-foreground">[git]</span>
                )}
              </span>
              {board.id !== "default" && (
                <button
                  className="ml-2 text-xs text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm(board.id);
                  }}
                >
                  x
                </button>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleOpenSettings}>
            Board Settings
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            + New Board
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create board dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Board</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Board name"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Git Repository URL
              </label>
              <Input
                value={newRepoUrl}
                onChange={(e) => setNewRepoUrl(e.target.value)}
                placeholder="e.g., https://github.com/you/project.git (optional)"
                className="font-mono text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Agents clone this repo and open a PR per task using their own git access. Leave empty for tasks that don&apos;t touch code.
              </p>
            </div>
            {newRepoUrl && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Base Branch
                  </label>
                  <Input
                    value={newBaseBranch}
                    onChange={(e) => setNewBaseBranch(e.target.value)}
                    placeholder="main"
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Git Provider
                  </label>
                  <select
                    value={newGitProvider}
                    onChange={(e) => setNewGitProvider(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Auto-detect from remote</option>
                    <option value="azuredevops">Azure DevOps</option>
                    <option value="github">GitHub</option>
                  </select>
                </div>
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createBoard.isPending}>
                {createBoard.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Board settings dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Board Settings: {displayName}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Git Repository URL
              </label>
              <Input
                value={editRepoUrl}
                onChange={(e) => setEditRepoUrl(e.target.value)}
                placeholder="e.g., https://github.com/you/project.git (optional)"
                className="font-mono text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Agents clone this repo, work on a branch per task, push it and open a PR with their own git/gh credentials. Everyone running an agent needs push access.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Base Branch
              </label>
              <Input
                value={editBaseBranch}
                onChange={(e) => setEditBaseBranch(e.target.value)}
                placeholder="main"
                className="font-mono text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                PRs will be created against this branch.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Git Provider
              </label>
              <select
                value={editGitProvider}
                onChange={(e) => setEditGitProvider(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Auto-detect from remote</option>
                <option value="azuredevops">Azure DevOps</option>
                <option value="github">GitHub</option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                PRs are opened on the agent&apos;s machine: <code>gh</code> for GitHub, <code>az repos pr</code> for Azure DevOps.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Max turns per task
              </label>
              <Input
                type="number"
                min={0}
                max={1000}
                value={editMaxTurns}
                onChange={(e) => setEditMaxTurns(e.target.value)}
                placeholder="Runner default (50)"
                className="text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                How many steps an agent gets before it stops and saves its progress for the next
                attempt. Tasks can override this.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSettingsOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateBoard.isPending}>
                {updateBoard.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog
        open={deleteConfirm !== null}
        onOpenChange={() => setDeleteConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Board</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this board? It must have no tasks.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={deleteBoard.isPending}
            >
              {deleteBoard.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
