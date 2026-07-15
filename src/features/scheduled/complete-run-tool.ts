import { z } from "zod";
import { zodResponsesFunction } from "openai/helpers/zod";
import type { InternalFunctionTool } from "@/features/agent/amio-conversations-capability";

const schema = z.object({
  slackMessage: z
    .string()
    .nullable()
    .describe(
      "Optional Slack-formatted summary of your findings. Include key numbers and one-line insight. Pass null if no Slack notification is needed.",
    ),
});

export function createCompleteScheduledRunTool(
  onComplete: (args: { slackMessage: string | null }) => void,
): InternalFunctionTool {
  return zodResponsesFunction({
    name: "complete_scheduled_run",
    description:
      "Call this tool when you have finished your scheduled task. You MUST call this tool before ending your response. Optionally provide a slackMessage with a brief summary of your findings.",
    parameters: schema,
    function: (args) => {
      onComplete({ slackMessage: args.slackMessage });
      return { status: "acknowledged" };
    },
  }) as InternalFunctionTool;
}
