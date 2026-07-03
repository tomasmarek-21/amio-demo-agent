import { z } from "zod";
import { agentRunner } from "@/features/agent/container";
import { AGENT_MODEL_IDS } from "@/features/agent/models";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  model: z.enum(AGENT_MODEL_IDS),
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
      { error: "Zpráva musí obsahovat 1 až 4000 znaků." },
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
