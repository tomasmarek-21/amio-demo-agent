import { z } from "zod";
import { chatRepository } from "@/features/agent/container";
import { SCHEDULED_WORKFLOWS, getWorkflow } from "@/features/scheduled/workflows";
import { runScheduledWorkflow } from "@/features/scheduled/scheduled-runner";

const postBodySchema = z.object({
  workflowId: z.string().min(1),
  callbackUrl: z.string().url().optional().nullable(),
  targetMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "must be YYYY-MM")
    .optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workflowId = searchParams.get("workflowId");

  if (workflowId) {
    const workflow = getWorkflow(workflowId);
    if (!workflow) {
      return Response.json({ error: "Workflow not found." }, { status: 404 });
    }
    const sessions = await chatRepository.listSessionsByWorkflow(workflowId);
    return Response.json({ sessions });
  }

  const workflows = Object.entries(SCHEDULED_WORKFLOWS).map(([id, w]) => ({
    id,
    name: w.name,
    n8nWorkflowUrl: w.n8nWorkflowUrl ?? null,
  }));
  return Response.json({ workflows });
}

export async function POST(request: Request) {
  const parsed = postBodySchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { workflowId, callbackUrl, targetMonth } = parsed.data;
  const workflow = getWorkflow(workflowId);
  if (!workflow) {
    return Response.json({ error: "Workflow not found." }, { status: 404 });
  }

  const session = await chatRepository.createScheduledSession(
    workflowId,
    callbackUrl ?? null,
    workflow.name,
  );

  const targetMonthStart = targetMonth ? `${targetMonth}-01` : undefined;
  void runScheduledWorkflow(session.id, workflowId, callbackUrl ?? null, targetMonthStart).catch(
    console.error,
  );

  return Response.json({ sessionId: session.id }, { status: 202 });
}
