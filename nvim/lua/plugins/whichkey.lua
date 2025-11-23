return {
  { -- Useful plugin to show you pending keybinds.
    'folke/which-key.nvim',
    lazy = true,
    event = 'VimEnter', -- Sets the loading event to 'VimEnter'
    opts = {
      delay = 200,
      icons = {
        mappings = vim.g.have_nerd_font,
        keys = vim.g.have_nerd_font and {} or {
          Up = '<Up> ',
          Down = '<Down> ',
          Left = '<Left> ',
          Right = '<Right> ',
          C = '<C-…> ',
          M = '<M-…> ',
          D = '<D-…> ',
          S = '<S-…> ',
          CR = '<CR> ',
          Esc = '<Esc> ',
          ScrollWheelDown = '<ScrollWheelDown> ',
          ScrollWheelUp = '<ScrollWheelUp> ',
          NL = '<NL> ',
          BS = '<BS> ',
          Space = '<Space> ',
          Tab = '<Tab> ',
        },
      },
      spec = {
        { '<leader>f', group = 'Telescope' },
        { '<leader>t', group = 'Toggle' },
        { '<leader>b', group = 'Buffers' },
        { '<leader>d', group = 'Debug' },
        { '<leader>g', group = 'Git' },
        { '<leader>h', group = 'Hunks', mode = { 'n', 'v' }, icon = " " },
      },
    },
  },
}
