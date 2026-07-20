# Pixel Editor

A dependency-free, offline, mobile-first pixel art editor. Pure HTML, CSS,
and vanilla JavaScript (ES modules) — no build step, no framework, no
server. Open `index.html` and start drawing.

## Run it

Just open `index.html` in a browser. Because it uses ES module imports
(`<script type="module">`), some browsers block `file://` module loading —
if that happens, serve the folder locally instead, e.g.:

```bash
cd pixel-editor
python3 -m http.server 8000
# then open http://localhost:8000
```

No install step, no `npm`, no bundler required either way.

## Using it

- **Draw**: tap/click and drag on the canvas with the selected tool.
- **Tools** (bottom bar): Pencil, Eraser, Fill bucket, Line, Rectangle,
  Circle, Eyedropper, Pan. Rectangle/Circle have a "Filled" toggle in the
  strip above the toolbar; Pencil/Eraser show a brush-size slider there.
- **Zoom & pan**: `+`/`−` buttons or mouse wheel (desktop); pinch with two
  fingers to zoom, drag with two fingers to pan (works regardless of which
  tool is selected — one-finger keeps drawing, two-finger always pans/zooms).
- **Grid**: `#` button or Ctrl+G.
- **Undo/redo**: header buttons, or Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z.
- **Panels**: the three header icons open the Layers, Color, and File
  panels (bottom sheet on phones, side panel on wider screens).
- **Color panel**: tap a swatch to select it, double-tap a custom swatch to
  remove it, hold any swatch ~0.5s to star it as a favorite. Hex input and
  a native OS color picker are both available, plus an alpha slider.
- **Layers panel**: add/duplicate/merge-down/delete, per-layer visibility,
  lock, opacity, rename, and reordering.
- **File panel**: New canvas (with size presets or a custom size up to
  256×256), Save as / Open (stored in this browser's `localStorage`),
  and Export (PNG, layer-based sprite sheet, JSON metadata, or a full
  `.pxproj.json` project file you can re-import later). Dark/light mode
  toggle also lives here.
- **Autosave**: every change is autosaved to `localStorage` (debounced) and
  restored automatically next time you open the app in the same browser.

### Keyboard shortcuts (desktop)

| Key | Action |
|---|---|
| B / E / G / L / R / C / I / H | Pencil / Eraser / Bucket / Line / Rect / Circle / Eyedropper / Pan |
| Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y | Undo, Redo, Redo |
| Ctrl+G | Toggle grid |
| + / − | Zoom in / out |

## Project structure

```
pixel-editor/
├── index.html        Page shell: header, canvas, toolbar, panels, dialogs
├── style.css          Responsive layout, mobile bottom-sheet / desktop side panels, dark mode
├── app.js             Entry point, calls js/ui.js's initUI()
├── README.md          This file
└── js/
    ├── state.js       Central app state (canvas, layers, tool, view, palette) + pub/sub
    ├── canvas.js      Layer compositing, zoom/pan rendering, grid, coordinate mapping
    ├── input.js        Pointer/touch/mouse gesture handling, pinch-zoom, pan
    ├── tools.js        Pencil/eraser/bucket/line/rect/circle/eyedropper logic (pure functions)
    ├── history.js      Undo/redo via layer-stack snapshots
    ├── storage.js       localStorage autosave + named "Save As" project library
    ├── export.js        PNG / sprite-sheet / metadata / project-file export
    ├── ui.js            DOM wiring: toolbar, panels, dialogs, shortcuts, toasts (glue only)
    ├── palette.js       Custom/recent/favorite color swatches, palette import/export
    ├── layers.js        Layer operations: add/remove/duplicate/merge/reorder/opacity
    ├── animation.js     Deferred to v2 (see Backlog) - stub module, documents the plan
    └── utils.js         Shared helpers: color packing, line/rect/circle rasterization, DOM helpers
```

Design principle followed throughout: **rendering, input, and tool logic
are separate modules.** `tools.js` never touches the DOM or canvas context;
`canvas.js` never decides what a stroke should do; `input.js` only
translates gestures into calls on `tools.js`/`history.js`. This is what
makes it possible to add a new tool or a new panel without touching
unrelated code.

## Data model notes

- Each layer stores pixels as a `Uint32Array`, one packed RGBA value per
  pixel (`state.canvas.width * state.canvas.height` entries). This keeps
  memory compact and pixel access O(1) even at 256×256 with several layers.
- The visible canvas is redrawn from a cached, fully-composited offscreen
  canvas; that offscreen composite is only recomputed when pixel data
  actually changes (`markCompositeDirty()`), not on every pan/zoom frame.
- Undo/redo snapshots the whole layer stack before each action. Simpler
  and far less bug-prone than per-pixel diffing; capped at 40 steps so
  memory stays bounded.

## Assumptions made

- "Open งานเดิม" (open existing work) is implemented as a local project
  library (`Save as…` / `Open…`) backed by `localStorage`, plus an
  importable/exportable `.pxproj.json` file for moving a project between
  browsers/devices — there's no backend, so this is the offline-friendly
  equivalent.
- Canvas sizes go up to 2048×2048 (with a performance warning past
  1024×1024); the pixel-buffer and coordinate-mapping approach scales to
  larger sizes without a rewrite if that cap is lifted further later.
- Favoriting a palette color is a long-press (~0.5s) gesture rather than a
  separate star button, to keep the swatch grid dense and thumb-friendly
  on small screens.

## Backlog (deliberately deferred to v2)

Per the brief's own guidance to leave incomplete features disabled rather
than half-built, these are stubbed or omitted rather than shipped partial:

- **Animation system** (`js/animation.js` is a documented stub): frame
  add/remove/duplicate, onion skinning, play/pause with FPS control, and
  GIF export. This needs its own timeline data model and playback UI and
  would be a substantial addition on top of an already large v1 scope. In
  the meantime, layers can stand in as manual "poses," and
  `export.js#exportSpriteSheetFromLayers` exports them as a sprite sheet.
- **Gradient picker** in the color panel.
- **Trim transparent edges** on export.
- **Tile mode / seamless preview.**
- **Account/login, cloud sync, multiplayer collaboration, online sharing,
  community gallery, marketplace, server-side processing, AI tools, asset
  store** — all explicitly out of scope per the brief; nothing in the
  current architecture assumes a server, so adding a backend later is an
  additive change, not a rewrite.

## Known trade-offs

- Emoji are used for toolbar icons instead of an icon font/SVG sprite to
  keep the project dependency-free; swap `js/ui.js`'s button labels for SVG
  if a more custom visual identity is wanted later.
- The eyedropper and fill bucket read/write the active layer's exact pixel
  values (no anti-aliasing/tolerance), which matches how pixel art tools
  are expected to behave.
