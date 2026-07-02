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
];
