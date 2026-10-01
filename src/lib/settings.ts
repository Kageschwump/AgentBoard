import { prisma } from "./db";

const DEFAULTS: Record<string, string> = {
  queuePaused: "false",
};

export async function getSetting(key: string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[key] ?? "";
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

/** When paused, runners are not handed new tasks (running tasks continue) */
export async function isQueuePaused(): Promise<boolean> {
  return (await getSetting("queuePaused")) === "true";
}
