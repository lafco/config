local wezterm = require 'wezterm'

local config = wezterm.config_builder()

-- Font settings
config.font_size = 10
config.line_height = 1.1
config.font = wezterm.font_with_fallback {
  { family = 'Jetbrains Mono' },
}

-- Colors
config.colors = {
  foreground = "#c8d3f5",
  background = "#222436",
  cursor_bg = "#c8d3f5",
  cursor_border = "#c8d3f5",
  cursor_fg = "#222436",
  selection_bg = "#2d3f76",
  selection_fg = "#c8d3f5",
  split = "#82aaff",
  compose_cursor = "#ff966c",
  scrollbar_thumb = "#2f334d",
  ansi = {"#1b1d2b", "#ff757f", "#c3e88d", "#ffc777", "#82aaff", "#c099ff", "#86e1fc", "#828bb8"},
  brights = {"#444a73", "#ff8d94", "#c7fb6d", "#ffd8ab", "#9ab8ff", "#caabff", "#b2ebff", "#c8d3f5"},
}
-- config.color_scheme = 'Catppuccin Mocha'

-- Appearance
config.cursor_blink_rate = 0
-- config.window_decorations = 'RESIZE'
config.hide_tab_bar_if_only_one_tab = true
config.window_padding = {
  left = 5,
  right = 5,
  top = 5,
  bottom = 5,
}

-- Miscellaneous settings
config.max_fps = 120
config.prefer_egl = true

return config
