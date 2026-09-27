import type { Mission } from "./types";
let token = "";
export function setToken(value: string) {
  token = value;
}
export async function request<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        "The AI server is unavailable. Start FastAPI on port 8000, then retry.",
      );
    }
    if (!response.ok)
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : "Check your inputs and try again.",
      );
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error(
        "The request timed out. Refresh mission status before retrying an action.",
      );
    if (error instanceof TypeError)
      throw new Error(
        "Cannot reach the AI server. Check that FastAPI is running on port 8000.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export const api = {
  config: () => request<{ demo: boolean; graph8_url: string }>("/ai/config"),
  plan: (goal: string) => request<Mission>("/ai/mission/plan", { goal }),
  mission: (id: string) => request<Mission>(`/ai/mission/${id}`),
  run: (id: string, command: string, extra: Record<string, unknown> = {}) =>
    request<Mission>("/ai/agent/run", { mission_id: id, command, ...extra }),
};
