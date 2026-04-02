"use server";

import { cookies } from "next/headers";
import { refresh, revalidatePath, updateTag } from "next/cache";
import { deleteEvent, deleteEvents, setEventRotation } from "@/lib/kv";
import { deleteEventBlobs } from "@/lib/blob";
import { validateSessionToken } from "@/lib/auth";
import { EVENTS_LIST_TAG, getEventTag } from "@/lib/events-cache";
import type { GeckoEvent, Rotation } from "@/lib/types";

type DeleteResult = {
  ok: boolean;
  error?: string;
  status?: number;
};

type BatchDeleteResult = DeleteResult & {
  deleted?: number;
};

type RotateResult = DeleteResult & {
  event?: GeckoEvent;
};

function revalidateEventPaths(ids: string[]) {
  revalidatePath("/");
  revalidatePath("/events");
  for (const id of ids) revalidatePath(`/events/${id}`);
}

function updateEventTags(ids: string[]) {
  updateTag(EVENTS_LIST_TAG);
  for (const id of ids) updateTag(getEventTag(id));
}

async function hasValidSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return validateSessionToken(cookieStore.get("gecko_session")?.value);
}

export async function deleteEventAction(id: string): Promise<DeleteResult> {
  if (!id) return { ok: false, error: "Event id required", status: 400 };
  if (!(await hasValidSession())) {
    return { ok: false, error: "Unauthorized", status: 401 };
  }

  try {
    const removed = await deleteEvent(id);
    if (!removed) {
      return { ok: false, error: "Event not found", status: 404 };
    }

    deleteEventBlobs(removed.clipUrl, removed.thumbnailUrl).catch((err) =>
      console.error(`deleteEventBlobs error for ${id}:`, String(err))
    );

    updateEventTags([id]);
    revalidateEventPaths([id]);
    refresh();

    return { ok: true };
  } catch (err) {
    console.error(`deleteEventAction(${id}) error:`, String(err));
    return { ok: false, error: "Failed to delete event", status: 500 };
  }
}

export async function deleteEventsAction(ids: string[]): Promise<BatchDeleteResult> {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "ids array required", status: 400 };
  }
  if (!(await hasValidSession())) {
    return { ok: false, error: "Unauthorized", status: 401 };
  }

  try {
    const removed = await deleteEvents(ids);

    await Promise.all(
      removed.map((event) =>
        deleteEventBlobs(event.clipUrl, event.thumbnailUrl).catch((err) =>
          console.error("deleteEventBlobs error:", String(err))
        )
      )
    );

    if (removed.length > 0) {
      const removedIds = removed.map((event) => event.id);
      updateEventTags(removedIds);
      revalidateEventPaths(removedIds);
      refresh();
    }

    return { ok: true, deleted: removed.length };
  } catch (err) {
    console.error("deleteEventsAction error:", String(err));
    return { ok: false, error: "Failed to delete events", status: 500 };
  }
}

export async function rotateEventAction(
  id: string,
  rotation: Rotation
): Promise<RotateResult> {
  if (!id) return { ok: false, error: "Event id required", status: 400 };
  if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) {
    return { ok: false, error: "Invalid rotation", status: 400 };
  }
  if (!(await hasValidSession())) {
    return { ok: false, error: "Unauthorized", status: 401 };
  }

  try {
    const updated = await setEventRotation(id, rotation);
    if (!updated) {
      return { ok: false, error: "Event not found", status: 404 };
    }

    updateEventTags([id]);
    revalidateEventPaths([id]);
    refresh();

    return { ok: true, event: updated };
  } catch (err) {
    console.error(`rotateEventAction(${id}) error:`, String(err));
    return { ok: false, error: "Failed to rotate event", status: 500 };
  }
}
