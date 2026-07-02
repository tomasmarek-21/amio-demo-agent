import { z } from "zod";
import { chatRepository } from "@/features/agent/container";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
});

export async function GET() {
  return Response.json({ sessions: await chatRepository.listSessions() });
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return Response.json({ error: "Neplatný název konverzace." }, { status: 400 });
  }
  const session = await chatRepository.createSession(parsed.data.title);
  return Response.json({ session }, { status: 201 });
}
