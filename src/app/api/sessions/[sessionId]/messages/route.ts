import { z } from "zod";
import { agentRunner } from "@/features/agent/container";
import {
  AGENT_MODEL_IDS,
  MODEL_REASONING_EFFORTS,
  REASONING_EFFORTS,
} from "@/features/agent/models";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(20_000),
  model: z.enum(AGENT_MODEL_IDS),
  reasoningEffort: z.enum(REASONING_EFFORTS).nullable(),
}).superRefine((value, context) => {
  const supported = MODEL_REASONING_EFFORTS[value.model];
  if (
    (supported.length === 0 && value.reasoningEffort !== null) ||
    (value.reasoningEffort !== null &&
      !supported.includes(value.reasoningEffort))
  ) {
    context.addIssue({
      code: "custom",
      path: ["reasoningEffort"],
      message: "The selected model does not support this reasoning level.",
    });
  }
});

interface Context {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: Request, context: Context) {
  const parsed = bodySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Message must contain 1 to 4000 characters." },
      { status: 400 },
    );
  }

  const { sessionId } = await context.params;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of agentRunner.run(
          sessionId,
          parsed.data.message,
          request.signal,
          parsed.data.model,
          parsed.data.reasoningEffort ?? undefined,
        )) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
          if (event.type === "completed" || event.type === "error") break;
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
