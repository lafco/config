local wezterm = require 'wezterm'

local config = wezterm.config_builder()

-- Font settings
config.font_size = 10
config.line_height = 1.1
config.font = wezterm.font_with_fallback {
  { family = 'JetBrains Mono Regular' },
}

-- Colors (Catppuccin Mocha)
config.color_scheme = 'Catppuccin Mocha'

-- Appearance
config.cursor_blink_rate = 0
-- 'NONE' removes the title bar and all window buttons (close/minimize/maximize).
-- If your WM/compositor still draws decorations, it is adding server-side
-- decorations; configure the WM (e.g. remove GTK header) instead.
config.window_decorations = 'NONE'
config.hide_tab_bar_if_only_one_tab = true
config.window_padding = {
  left = 5,
  right = 5,
  top = 5,
  bottom = 5,
}

-- Shell (resolvido pelo PATH: no NixOS o bash vive no store, não em
-- /usr/bin/bash — caminho absoluto quebrava o wezterm na instalação)
config.default_prog = { 'bash', '-l' }

-- Kitty keyboard protocol desligado: com ele ativo, o Esc no prefix mode
-- do herdr era despachado como 'lone escape' para o pane (não cancelava).
-- Reativar se a detecção de modificadores do pi regredir.
config.enable_kitty_keyboard = false

-- Miscellaneous settings
config.max_fps = 120
config.prefer_egl = true

return config
