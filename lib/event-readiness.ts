import { getEvent } from "./kv";

const EVENT_READINESS_RETRIES = 7;
const EVENT_READINESS_DELAY_MS = 350;

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForEventReadiness(
  id: string,
  retries = EVENT_READINESS_RETRIES
): Promise<boolean> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const event = await getEvent(id);
    if (event) {
      return true;
    }

    if (attempt < retries) {
      await delay(EVENT_READINESS_DELAY_MS * (attempt + 1));
    }
  }

  return false;
}
