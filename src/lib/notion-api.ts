import { BASE_PATH } from "@/lib/base-path";

export interface NotionStatus {
  connected: boolean;
}

export async function getNotionStatus(): Promise<NotionStatus> {
  const response = await fetch(`${BASE_PATH}/api/integrations/notion`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to load Notion connection status.");
  }
  return response.json() as Promise<NotionStatus>;
}
