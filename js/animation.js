/**
 * animation.js
 * DEFERRED TO V2 - see README.md "Backlog" section for the full rationale.
 *
 * Frame-based animation (add/remove/duplicate frame, onion skinning,
 * play/pause, FPS control, sprite-sheet/GIF export of frame sequences) is
 * a substantial feature: it needs its own timeline data model, a playback
 * loop, and UI (scrubber, frame list) that would meaningfully change
 * canvas.js and ui.js if bolted on partially. Rather than ship a half
 * -working timeline in v1, this module is intentionally left as a stub so
 * the rest of the app stays solid and shippable today.
 *
 * What v1 gives you instead: each layer can already act as a manual
 * "pose" (e.g. walk-cycle frames on separate layers), and
 * export.js#exportSpriteSheetFromLayers lets you export those layers as a
 * horizontal sprite sheet right now.
 *
 * When this module is implemented, the intended shape is:
 *   - a `frames` array on state (each frame = a layer stack snapshot, or a
 *     reference into a shared layer set for onion-skin purposes)
 *   - initAnimation(), addFrame(), removeFrame(), duplicateFrame(),
 *     setFps(), play(), pause(), onion-skin render hooks into canvas.js
 */

export function isAnimationAvailable() {
  return false;
}
