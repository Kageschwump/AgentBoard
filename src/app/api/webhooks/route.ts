/**
 * Webhook API Trigger
 *
 * POST /api/webhooks
 *
 * Accepts incoming webhook payloads to create tasks automatically.
 *
 * Authentication:
 *   - If WEBHOOK_SECRET env var is set, requests must include
 *     X-Webhook-Secret header matching that value.
 *   - If no secret is configured, all requests are accepted (dev mode).
 *
 * Payload formats:
 *   1. Direct task format:
 *      { "title": "...", "description": "...", "priority": 2 }
 *
 *   2. GitHub webhook format (auto-detected by "action" + "issue"/"pull_request" fields):
 *      Forwarded to /api/webhooks/github handler logic
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureDefaults } from "@/lib/ensure-defaults";
import { emitEvent } from "@/lib/event-emitter";
import { z } from "zod/v4";

const directTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().default(""),
  criteria: z.string().optional().default(""),
  repoUrl: z.string().optional().default(""),
  priority: z.number().int().min(1).max(3).optional().default(2),
  tags: z.string().optional().default(""),
  model: z.string().optional().default(""),
});

function checkAuth(request: Request): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true; // no secret configured = allow all
  return request.headers.get("X-Webhook-Secret") === secret;
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureDefaults();
    const body = await request.json();

    // Detect GitHub webhook format
    if (body.action && (body.issue || body.pull_request)) {
      return handleGitHubWebhook(body);
    }

    // Direct task format
    const data = directTaskSchema.parse(body);

    const maxPos = await prisma.task.aggregate({
      _max: { position: true },
      where: { status: "todo" },
    });

    const task = await prisma.task.create({
      data: {
        ...data,
        boardId: "default",
        position: (maxPos._max.position ?? 0) + 1,
      },
    });

    emitEvent({ type: "task:updated", taskId: task.id });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", issues: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create task from webhook" },
      { status: 500 }
    );
  }
}

async function handleGitHubWebhook(body: Record<string, unknown>) {
  const action = body.action as string;
  if (action !== "opened") {
    return NextResponse.json(
      { message: `Ignored action: ${action}` },
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
      { error: "No title found in webhook payload" },
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
}
