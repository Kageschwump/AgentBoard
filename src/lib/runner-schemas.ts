import { z } from "zod/v4";

export const usageSchema = z.object({
  inputTokens: z.number().min(0),
  outputTokens: z.number().min(0),
  costEstimate: z.number().min(0),
});
