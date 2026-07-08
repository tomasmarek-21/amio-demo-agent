import type { IntegrationsHealth } from "@/features/integrations/types";

export async function getIntegrationsStatus(): Promise<IntegrationsHealth> {
  const response = await fetch("/api/integrations", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Stav integrací se nepodařilo načíst.");
  }
  return response.json() as Promise<IntegrationsHealth>;
}
