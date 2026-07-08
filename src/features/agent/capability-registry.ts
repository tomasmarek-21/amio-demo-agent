export interface CapabilityDescriptor {
  id: string;
  description: string;
}

export const capabilityRegistry: CapabilityDescriptor[] = [
  {
    id: "posthog",
    description:
      "Read-only website analytics: events, landing pages, journeys, funnels, and exits.",
  },
  {
    id: "amio_conversations",
    description:
      "Read-only demo chat conversation history, transcripts, button clicks, and conversation-level analytics.",
  },
];
