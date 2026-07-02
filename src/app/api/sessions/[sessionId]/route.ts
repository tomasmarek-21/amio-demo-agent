import { chatRepository } from "@/features/agent/container";

interface Context {
  params: Promise<{ sessionId: string }>;
}

export async function GET(_request: Request, context: Context) {
  const { sessionId } = await context.params;
  const session = await chatRepository.getSession(sessionId);
  if (!session) {
    return Response.json(
      { error: "Konverzace nebyla nalezena." },
      { status: 404 },
    );
  }
  return Response.json({ session });
}
