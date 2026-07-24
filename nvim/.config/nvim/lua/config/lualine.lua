-- Lualine statusline

require('mini.icons').setup()
require('mini.icons').mock_nvim_web_devicons()

local function get_colorscheme_colors()
  local colorscheme = vim.g.colors_name or 'default'
  if string.find(colorscheme, 'catppuccin') then
    local palette = require('catppuccin.palettes').get_palette()
    return {
      bg = palette.base,
      text = palette.text,
      blue = palette.blue,
      black = palette.crust,
      yellow = palette.yellow,
      bg_float = palette.mantle,
    }

  end
  -- Fallback
  return {
    bg = '#1e1e2e',
    text = '#cdd6f4',
    blue = '#89b4fa',
    black = '#11111b',
    yellow = '#f9e2af',
    bg_float = '#181825',
  }
end

local colors = get_colorscheme_colors()

-- ── DAP status component ───────────────────────────────────────────
local function dap_status()
  local ok, dap = pcall(require, 'dap')
  if not ok then return '' end
  if not dap.session() then return '' end
  local status = dap.status()
  if status == '' then return '' end
  return '󰃤 ' .. status
end

require('lualine').setup({
  sections = {
    lualine_c = { 'filename', 'harpoon' },
    lualine_x = { dap_status },
  },
  tabline = {},
  options = {
    always_show_tabline = false,
    theme = {
      normal = {
        a = { bg = colors.bg, fg = colors.text, gui = 'bold' },
        b = { bg = colors.bg, fg = colors.text },
        c = { bg = colors.bg, fg = colors.text },
      },
      insert = {
        a = { bg = colors.blue, fg = colors.black, gui = 'bold' },
      },
      visual = {
        a = { bg = colors.yellow, fg = colors.black, gui = 'bold' },
      },
    },
    component_separators = { left = '│', right = '│' },
    section_separators = { left = '', right = '' },
    globalstatus = true,
    refresh = { statusline = 100 },
  },
})
