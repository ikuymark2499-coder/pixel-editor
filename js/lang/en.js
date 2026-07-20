/**
 * PixStar
 * File        : js/lang/en.js
 * Description : English translation strings, keyed to match js/lang/th.js.
 */

export default {
  home_new_project: "New images",
  home_custom_btn: "Custom",
  home_create_btn: "Create",
  home_gallery: "My Projects",
  home_empty: "No saved projects yet. Let's create one! 🚀",
  home_open_file: "Open from File",
  home_choose_file: "Choose .pxproj.json file",
  home_open_hint: "Select a project file exported earlier (.pxproj.json)",
  
  sidebar_home: "Home",
  
  // General
  app_title: "Pixora Editor",
  project_name_untitled: "untitled",

  // Top bar
  menu_title: "Menu",
  menu_aria_label: "Open menu",
  undo_title: "Undo (Ctrl+Z)",
  redo_title: "Redo (Ctrl+Y)",
  layers_title: "Layers",
  color_title: "Color",
  file_title: "File",

  // Toolbar
  toolbar_aria_label: "Drawing tools",
  tool_pencil: "Pencil",
  tool_pencil_title: "Pencil (B)",
  tool_eraser_title: "Eraser (E)",
  tool_bucket_title: "Fill bucket (G)",
  tool_line_title: "Line (L)",
  tool_rect_title: "Rectangle (R)",
  tool_circle_title: "Circle (C)",
  tool_eyedropper_title: "Eyedropper (I)",
  tool_pan_title: "Pan / Move (H)",
  zoom_out_title: "Zoom out (-)",
  zoom_in_title: "Zoom in (+)",
  grid_title: "Toggle grid (Ctrl+G)",
  clear_title: "Clear canvas",

  // Status bar tool labels
  status_tool_pencil: "Pencil",
  status_tool_eraser: "Eraser",
  status_tool_bucket: "Fill bucket",
  status_tool_line: "Line",
  status_tool_rect: "Rectangle",
  status_tool_circle: "Circle",
  status_tool_eyedropper: "Eyedropper",
  status_tool_pan: "Pan",

  // Color panel
  panel_color_heading: "Color",
  swatch_primary_title: "Primary color",
  swatch_secondary_title: "Secondary color",
  swatch_swap_title: "Swap colors",
  field_hex: "Hex",
  hex_placeholder: "#000000",
  color_picker_sv_aria: "Saturation and value picker",
  color_picker_hue_aria: "Hue slider",
  field_alpha: "Alpha",
  swatches_default_heading: "Swatches",
  swatches_custom_heading: "Custom",
  btn_add_custom: "+ Add current",
  swatches_recent_heading: "Recent",
  swatches_favorites_heading: "Favorites",
  btn_export_palette: "Export palette",
  btn_import_palette: "Import palette",
  swatch_hint_remove: " (double-tap to remove, hold to favorite)",
  swatch_hint_favorite: " (hold to favorite)",

  // Layers panel
  panel_layers_heading: "Layers",
  btn_layer_add: "+ Layer",
  btn_layer_dup: "Duplicate",
  btn_layer_merge: "Merge down",
  btn_layer_delete: "Delete",
  layers_hint: "New layers always pop to the top. Duplicate one before doing anything risky. Merge Down when you're ready. Delete the junk. Use the slider to adjust opacity. 👁 = Hide 🔒 = No drawing allowed. ⋮ = The good stuff lives here: Move, Rotate, Resize, and more. P.S. Pick the right layer first, okay? 😏",
  layer_default_name: "Layer",
  layer_opacity_title: "Opacity",
  layer_toggle_visibility_title: "Toggle visibility",
  layer_toggle_lock_title: "Toggle lock",
  layer_options_title: "Layer options",
  layer_move_up_title: "Move up",
  layer_move_down_title: "Move down",
  layer_transform_title: "Transform layer (move/scale/rotate)",

  // Transform box (move/scale/rotate)
  transform_aspect_lock: "Lock aspect ratio",
  transform_apply_btn: "Apply",
  transform_cancel_btn: "Cancel",
  transform_close_title: "Close (cancels the transform)",
  toast_transform_active: "Transform:",
  toast_transform_applied: "Transform applied",
  toast_transform_cancelled: "Transform cancelled",
  toast_aspect_locked: "Aspect ratio locked",
  toast_aspect_unlocked: "Aspect ratio unlocked",

  // File panel / menu
  panel_file_heading: "File",
  file_language_heading: "Language",
  file_project_heading: "Project",
  btn_new_canvas: "New canvas…",
  btn_open_canvas: "Open…",
  btn_save_as: "Save as…",
  autosave_hint: "Autosaved locally.",

  file_export_heading: "Export",
  field_filename: "File name",
  field_scale: "Scale",
  field_transparent: "Transparent background",
  btn_export_png: "Export PNG",
  btn_export_sheet: "Sprite sheet (layers)",
  btn_export_meta: "Export JSON metadata",
  btn_export_project: "Export project file",
  btn_import_project: "Import project file",

  file_appearance_heading: "Appearance",
  field_dark_mode: "Dark mode",

  // Tool options (brush / filled)
  field_brush: "Brush",
  field_filled: "Filled",

  // Dialog: new canvas
  field_preset_size: "Preset size",
  preset_custom: "Custom…",
  btn_create: "Create",

  // Dialog: clear canvas
  dialog_clear_heading: "Clear canvas?",
  clear_canvas_hint: "This clears the active layer only. You can undo it right after.",
  btn_clear_confirm: "Clear",

  // Dialog: save as
  dialog_save_as_heading: "Save as",
  field_project_name: "Project name",
  save_as_placeholder: "my-sprite",
  btn_save: "Save",

  // Dialog: open project
  dialog_open_heading: "Open project",
  open_empty_hint: "No saved projects yet.",
  btn_close: "Close",
  project_open_button: "Open",
  project_delete_button: "Delete",

  // Toasts
  toast_palette_exported: "Palette exported",
  toast_palette_imported: "Palette imported",
  toast_palette_import_error: "Could not read palette file",
  toast_color_picked: "Color picked",
  toast_layer_added: "Layer added",
  toast_frame_added: "Frame added",
  toast_frame_duplicated: "Frame duplicated",
  toast_frame_deleted: "Frame deleted",
  toast_frame_delete_error: "Cannot delete - need at least 1 frame",
  toast_layer_merged: "Merged down",
  toast_layer_merge_error: "Nothing below to merge into",
  toast_layer_delete_error: "Cannot delete the only layer",
  toast_png_exported: "PNG exported",
  toast_export_error: "Export failed",
  toast_sprite_sheet_exported: "Sprite sheet exported",
  toast_metadata_exported: "Metadata exported",
  toast_project_exported: "Project file exported",
  toast_project_imported: "Project imported",
  toast_project_import_error: "Could not read project file",
  toast_project_opened: 'Opened "{name}"',
  toast_project_name_required: "Enter a project name",
  toast_project_saved: 'Saved as "{name}"',
  toast_canvas_created: "New {size} canvas",
  toast_canvas_cleared: "Canvas cleared",
  
  layer_popup_transform: "Transform",
  layer_popup_move_up: "Move up",
  layer_popup_move_down: "Move down",
  layer_popup_duplicate: "Duplicate layer",
  layer_popup_merge_down: "Merge down",
  layer_popup_delete: "Delete layer",
  layer_popup_options: "Layer options",
  
  file_background_heading: "Canvas Background",
  btn_change_background: "Change background…",
  panel_background_heading: "Canvas Background",
  bg_hint: "Choose the canvas background (displayed below layers)",
  bg_type_theme: "Follow theme",
  bg_type_solid: "Solid color",
  bg_type_checkerboard: "Transparent (checkerboard)",
  bg_choose_color: "Pick a color",
  
  // New Canvas Dialog
  dialog_new_heading: "New Canvas",
  new_canvas_select_hint: "Select size:",
  new_canvas_custom_btn: "Custom",
  new_canvas_create_btn: "Create",
  new_canvas_perf_hint: "⚠️ Sizes larger than 1024×1024 may cause performance issues (max 2048×2048)",
  new_canvas_hint: "Click a size to create a new canvas. Current work will be replaced.",
  field_width: "Width",
  field_height: "Height",
  btn_cancel: "Cancel",
  
  new_canvas_title: "New images",
  
  sidebar_title: "Menu",
  sidebar_placeholder: "Ready for future menu items",
  
  create_project_title: "New Project",
  create_project_name: "Project name",
  create_project_name_placeholder: "My project name",
  toast_project_created: 'Project "{name}" created',
  
  import_warning_title: "⚠️ Open External File",
  import_warning_message: "Pixora Editor only supports .pxproj.json files exported from this app",
  import_warning_hint: ".json or other files not created by Pixora Editor cannot be opened",
  import_warning_dont_show: "Don't show again (can be re-enabled in settings)",
  import_warning_continue: "Continue",
  
  btn_import_image: "Import Image",
  toast_image_imported: "📐 Image placed. Adjust size/position then press Apply",
  
  new_canvas_name: "Image name",
  new_canvas_name_eiei: "My image name",
  new_canvas_recommended: "Square",
  new_canvas_portrait: "Portrait 16:9",
  new_canvas_landscape: "Landscape 9:16",
  new_canvas_animation: "Animation",

  btn_export_animation:"Export animation (ZIP)",

  settings_title: "Settings",
  settings_data_heading: "Data",
  settings_clear_data: "Clear all data",
  settings_clear_data_hint: "Deletes all projects, gallery items, and autosave on this device",
  settings_clear_confirm_title: "Confirm clear data",
  settings_clear_confirm_body: "This will permanently delete all projects, gallery items, and autosave. This cannot be undone.",
  settings_clear_confirm_btn: "Clear data",
  toast_data_cleared: "All data cleared",
  
  home_gallery_title: "Gallery",
};
