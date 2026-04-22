export const NAVIGATION_TRANSITION = "navigation";
export const EVENT_DRILLDOWN_TRANSITION = "event-drilldown";
export const EVENT_RETURN_TRANSITION = "event-return";
export const EVENT_NEWER_TRANSITION = "event-newer";
export const EVENT_OLDER_TRANSITION = "event-older";

export function eventMediaTransitionName(id: string): string {
  return `event-media-${id}`;
}

export function eventTitleTransitionName(id: string): string {
  return `event-title-${id}`;
}
