import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/settings";
import { z } from "zod/v4";

const updateSettingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

export async function GET() {
  const queuePaused = (await getSetting("queuePaused")) === "true";
  return NextResponse.json({ queuePaused });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { key, value } = updateSettingSchema.parse(body);

    await setSetting(key, value);

    return NextResponse.json({ success: true, key, value });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", issues: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to update setting" },
      { status: 500 }
    );
  }
}
