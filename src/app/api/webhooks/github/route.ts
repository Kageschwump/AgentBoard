/**
 * GitHub Webhook Handler
 *
 * POST /api/webhooks/github
 *
 * Specifically handles GitHub issue and pull request webhook events.
 *
 * Setup in GitHub:
 *   1. Go to repo Settings > Webhooks > Add webhook
 *   2. Payload URL: https://your-domain/api/webhooks/github
 *   3. Content type: application/json
 *   4. Events: Issues, Pull requests
 *   5. Set secret in WEBHOOK_SECRET env var (optional for dev)
 *
 * Behavior:
 *   - Only acts on "opened" action (new issues/PRs)
 *   - Maps issue.title -> task.title
 *   - Maps issue.body -> task.description
 *   - Appends issue.html_url to the description
 *   - Maps repository.clone_url -> task.repoUrl (the repo runners check out)
 *   - Tags: "issue" or "pr" based on event type
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureDefaults } from "@/lib/ensure-defaults";
import { emitEvent } from "@/lib/event-emitter";

function checkAuth(request: Request): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true;
  return request.headers.get("X-Webhook-Secret") === secret;
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureDefaults();
    const body = await request.json();
    const action = body.action as string | undefined;

    if (action !== "opened") {
      return NextResponse.json(
        { message: `Ignored action: ${action ?? "unknown"}` },
        { status: 200 }
      );
    }

    const issue = (body.issue || body.pull_request) as {
      title?: string;
      body?: string;
      html_url?: string;
    } | undefined;

    if (!issue?.title) {
      return NextResponse.json(
        { error: "No issue or pull_request found in payload" },
        { status: 400 }
      );
    }

    const maxPos = await prisma.task.aggregate({
      _max: { position: true },
      where: { status: "todo" },
    });

    const repository = body.repository as { clone_url?: string } | undefined;
    const task = await prisma.task.create({
      data: {
        title: issue.title,
        description: [issue.body, issue.html_url && `Source: ${issue.html_url}`]
          .filter(Boolean)
          .join("\n\n"),
        repoUrl: repository?.clone_url || "",
        boardId: "default",
        tags: body.pull_request ? "pr" : "issue",
        position: (maxPos._max.position ?? 0) + 1,
      },
    });

    emitEvent({ type: "task:updated", taskId: task.id });
    return NextResponse.json(task, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to process GitHub webhook" },
      { status: 500 }
    );
  }
}
