import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IDENTITY_TRANSFORM,
  clampClipTransform,
  displayedAspect,
  fitContain,
  mediaOrientationStyle,
  panBy,
  stageTransform,
  wheelZoomFactor,
  zoomAtPointWithinFrame,
} from "./clip-zoom.ts";

const viewport = { width: 800, height: 450 };
const frame = { width: 800, height: 450 };

describe("clip zoom", () => {
  it("keeps zoom and pan in screen space, separate from rotation", () => {
    const zoomed = zoomAtPointWithinFrame(
      IDENTITY_TRANSFORM,
      viewport,
      frame,
      { x: 0, y: 0 },
      2,
    );

    assert.equal(zoomed.zoom, 2);
    assert.ok(zoomed.x > 0, "zooming the top-left pans the picture rightward");
    assert.ok(zoomed.y > 0, "zooming the top-left pans the picture downward");
    assert.equal(stageTransform(zoomed).includes("rotate"), false);
    assert.match(stageTransform(zoomed), /^translate\([\d.-]+px, [\d.-]+px\) scale\([\d.-]+\)$/);
  });

  it("does not let pan drag the clip out of the viewport", () => {
    const zoomed = zoomAtPointWithinFrame(IDENTITY_TRANSFORM, viewport, frame, { x: 400, y: 225 }, 2);
    const panned = panBy(zoomed, 10_000, -10_000, viewport, frame);

    assert.equal(panned.x, (frame.width * 2 - viewport.width) / 2);
    assert.equal(panned.y, -((frame.height * 2 - viewport.height) / 2));
  });

  it("locks pan at the fitted zoom", () => {
    const clamped = clampClipTransform({ zoom: 1, x: 40, y: -20 }, viewport, frame);
    assert.deepEqual(clamped, IDENTITY_TRANSFORM);
  });

  it("zooms toward the cursor without moving that point", () => {
    const focal = { x: 100, y: 80 };
    const next = zoomAtPointWithinFrame(IDENTITY_TRANSFORM, viewport, frame, focal, 2);
    const centerX = viewport.width / 2;
    const centerY = viewport.height / 2;
    const before = {
      x: (focal.x - centerX - IDENTITY_TRANSFORM.x) / IDENTITY_TRANSFORM.zoom,
      y: (focal.y - centerY - IDENTITY_TRANSFORM.y) / IDENTITY_TRANSFORM.zoom,
    };
    const after = {
      x: (focal.x - centerX - next.x) / next.zoom,
      y: (focal.y - centerY - next.y) / next.zoom,
    };

    assert.ok(Math.abs(before.x - after.x) < 1e-6);
    assert.ok(Math.abs(before.y - after.y) < 1e-6);
  });

  it("fits a portrait rotation inside a landscape viewport", () => {
    assert.equal(displayedAspect(16 / 9, 90), 9 / 16);
    const fitted = fitContain({ width: 800, height: 600 }, 9 / 16);
    assert.ok(fitted.width < 800);
    assert.equal(fitted.height, 600);
  });

  it("orients 90 degree media by swapping the box instead of scaling it", () => {
    const style = mediaOrientationStyle(90, { width: 180, height: 320 });
    assert.equal(style.width, 320);
    assert.equal(style.height, 180);
    assert.match(style.transform ?? "", /rotate\(90deg\)/);
    assert.equal((style.transform ?? "").includes("scale"), false);

    const halfTurn = mediaOrientationStyle(180, frame);
    assert.equal(halfTurn.transform, "rotate(180deg)");
    assert.equal(mediaOrientationStyle(0, frame).transform, undefined);
  });

  it("treats a wheel notch as a modest zoom step", () => {
    const factor = wheelZoomFactor(100, 0);
    assert.ok(factor < 1);
    assert.ok(factor > 0.7);
  });
});
