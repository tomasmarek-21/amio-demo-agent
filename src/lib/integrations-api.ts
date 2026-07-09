import { BASE_PATH } from "@/lib/base-path";
import type { IntegrationsHealth } from "@/features/integrations/types";

export async function getIntegrationsStatus(): Promise<IntegrationsHealth> {
  const response = await fetch(`${BASE_PATH}/api/integrations`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to load integrations status.");
  }
  return response.json() as Promise<IntegrationsHealth>;
}
