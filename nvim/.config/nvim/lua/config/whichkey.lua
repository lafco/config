-- Which-key v3: shows available keymaps on pause (Space leader).
-- Icon defaults use Nerd Font glyphs (vim.g.have_nerd_font = true).
-- If you ever set have_nerd_font = false, uncomment the icons block below.

require('which-key').setup({
  delay = 200,
  -- icons = {  -- only needed when have_nerd_font = false
  --   mappings = false,
  --   keys = {
  --     Up = '<Up> ',       Down = '<Down> ',
  --     Left = '<Left> ',   Right = '<Right> ',
  --     C = '<C-…> ',       M = '<M-…> ',
  --     D = '<D-…> ',       S = '<S-…> ',
  --     CR = '<CR> ',       Esc = '<Esc> ',
  --     ScrollWheelDown = '<ScrollWheelDown> ',
  --     ScrollWheelUp = '<ScrollWheelUp> ',
  --     NL = '<NL> ',       BS = '<BS> ',
  --     Space = '<Space> ', Tab = '<Tab> ',
  --   },
  -- },
  spec = {
    { '<leader>f', group = 'Telescope', icon = '󰍉 ' },
    { '<leader>t', group = 'Toggle', icon = '󰔟 ' },
    { '<leader>b', group = 'Buffers', icon = '󰈚 ' },
    { '<leader>d', group = 'Debug', icon = '󰃤 ' },
    { '<leader>p', group = 'Print', icon = '󰟀 ' },
    { '<leader>g', group = 'Git', icon = '󰊢 ' },
    { '<leader>h', group = 'Hunks', mode = { 'n', 'v' }, icon = ' ' },
    { '<leader>r', icon = '󰆒 ', desc = 'Registers' },
    { '<leader>k', icon = ' ', desc = 'Keymaps' },
    { '<leader>fm', icon = '󰄵 ', desc = 'List marks' },
    { '<leader>q', icon = '󰛂 ', desc = 'Quickfix List' },
    { '<leader>l', icon = '󰒓 ', desc = 'Line Diagnostics' },
    { '<leader>e', icon = '󰉋 ', desc = 'Open file explorer' },
    { '<leader>c', icon = '󰷜 ', desc = 'Format buffer' },
    { '<leader>a', icon = '󱠷 ', desc = 'Mark file' },
    { '<leader>A', icon = '󱠸 ', desc = 'Unmark file' },
  },
})
