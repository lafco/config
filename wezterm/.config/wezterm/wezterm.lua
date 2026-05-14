local wezterm = require 'wezterm'

local config = wezterm.config_builder()

-- Font settings
config.font_size = 10
config.line_height = 1.1
config.font = wezterm.font_with_fallback {
  { family = 'Jetbrains Mono' },
}

-- Colors (Catppuccin Mocha)
config.color_scheme = 'Catppuccin Mocha'

-- Appearance
config.cursor_blink_rate = 0
config.window_decorations = 'RESIZE'
config.hide_tab_bar_if_only_one_tab = true
config.window_padding = {
  left = 5,
  right = 5,
  top = 5,
  bottom = 5,
}

-- Shell
config.default_prog = { '/usr/bin/bash', '-l' }

-- Miscellaneous settings
config.max_fps = 120
config.prefer_egl = true

return config
