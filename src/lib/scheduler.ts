import { prisma } from "./db";
import { emitEvent } from "./event-emitter";
import { shouldRunNow } from "./cron-parser";

const SCHEDULER_INTERVAL = 60000; // 60s

class TaskScheduler {
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  start() {
    if (this.running) return;
    this.running = true;
    this.pollTimer = setInterval(() => this.tick(), SCHEDULER_INTERVAL);
    this.tick(); // immediate first tick
  }

  stop() {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  isRunning() {
    return this.running;
  }

  private async tick() {
    if (!this.running) return;
    try {
      await this.processOneTimeTasks();
      await this.processRecurringTasks();
    } catch {
      // Scheduler errors are non-critical
    }
  }

  private async processOneTimeTasks() {
    const now = new Date();
    const tasks = await prisma.task.findMany({
      where: {
        status: "todo",
        scheduledFor: { not: null, lte: now },
        recurring: false,
      },
    });

    for (const task of tasks) {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "ready", scheduledFor: null },
      });
      emitEvent({ type: "task:updated", taskId: task.id });
    }
  }

  private async processRecurringTasks() {
    const tasks = await prisma.task.findMany({
      where: {
        recurring: true,
        status: "todo",
        cronExpression: { not: "" },
      },
    });

    const now = new Date();

    for (const task of tasks) {
      if (!shouldRunNow(task.cronExpression, now)) continue;

      // Check last-run tracking to prevent duplicate runs within the same minute
      const lastRunKey = `scheduler:lastRun:${task.id}`;
      const lastRunSetting = await prisma.setting.findUnique({
        where: { key: lastRunKey },
      });

      if (lastRunSetting) {
        const lastRunTime = new Date(lastRunSetting.value);
        // If last run was within the same minute, skip
        if (
          lastRunTime.getFullYear() === now.getFullYear() &&
          lastRunTime.getMonth() === now.getMonth() &&
          lastRunTime.getDate() === now.getDate() &&
          lastRunTime.getHours() === now.getHours() &&
          lastRunTime.getMinutes() === now.getMinutes()
        ) {
          continue;
        }
      }

      // Clone the template task
      const cloneId = crypto.randomUUID();
      const clone = await prisma.task.create({
        data: {
          id: cloneId,
          title: task.title,
          description: task.description,
          criteria: task.criteria,
          repoUrl: task.repoUrl,
          status: "ready",
          priority: task.priority,
          tags: task.tags,
          dependsOn: task.dependsOn,
          model: task.model,
          assignedRunnerId: task.assignedRunnerId,
          boardId: task.boardId,
          recurring: false,
          sourceTaskId: task.id,
        },
      });

      // Track last-run time
      await prisma.setting.upsert({
        where: { key: lastRunKey },
        update: { value: now.toISOString() },
        create: { key: lastRunKey, value: now.toISOString() },
      });

      emitEvent({ type: "task:updated", taskId: clone.id });
    }
  }
}

// Singleton via globalThis (survives HMR)
const globalForScheduler = globalThis as unknown as {
  scheduler: TaskScheduler | undefined;
};

export function getScheduler(): TaskScheduler {
  if (!globalForScheduler.scheduler) {
    globalForScheduler.scheduler = new TaskScheduler();
  }
  return globalForScheduler.scheduler;
}
