-- Telescope: fuzzy finder

local actions = require('telescope.actions')

require('telescope').setup({
  defaults = {
    selection_caret = '▎ ',
    multi_icon = ' │ ',
    winblend = 0,
    borderchars = { '─', '│', '─', '│', '┌', '┐', '┘', '└' },
    mappings = {
      i = {
        ['<C-b>'] = actions.select_horizontal,
        ['<C-c>'] = actions.close,
        ['<C-d>'] = actions.preview_scrolling_down,
        ['<C-u>'] = actions.preview_scrolling_up,
        ['<C-v>'] = actions.select_vertical,
        ['<c-enter>'] = 'to_fuzzy_refine',
      },
      n = {
        ['q'] = actions.close,
        ['<C-b>'] = actions.select_horizontal,
        ['<C-c>'] = actions.close,
        ['<C-d>'] = actions.preview_scrolling_down,
        ['<C-u>'] = actions.preview_scrolling_up,
        ['<C-v>'] = actions.select_vertical,
      },
    },
    layout_config = {
      prompt_position = 'top',
      preview_width = 0.56,
      width = 0.87,
      height = 0.70,
    },
    sorting_strategy = 'ascending',
    file_ignore_patterns = { 'node_modules' },
    path_display = { 'filename_first', 'truncate' },
  },
  pickers = {
    buffers = {
      mappings = {
        n = {
          ['<C-e>'] = 'delete_buffer',
          ['l'] = 'select_default',
        },
      },
      initial_mode = 'insert',
    },
    zoxide = {
      path_display = { 'filename_first', 'truncate' },
    },
    live_grep = {
      show_line = false,       -- exibe só filename:lnum, não o texto do match
      only_sort_text = true,   -- mas continua buscando/filtrando pelo texto
    },
    grep_string = {
      show_line = false,
      only_sort_text = true,
    },
  },
  extensions = {
    undo = {
      initial_mode = 'normal',
      layout_config = { preview_width = 0.7 },
    },
    advanced_git_search = {
      diff_plugin = 'diffview',
      keymaps = {
        toggle_date_author = '<C-w>',
        open_commit_in_browser = '<C-o>',
        copy_commit_hash = '<C-y>',
        copy_commit_patch = '<C-h>',
        show_entire_commit = '<C-e>',
      },
    },
  },
})

require('telescope').load_extension('undo')
require('telescope').load_extension('zoxide')
require('telescope').load_extension('yank_history')

-- Keymaps
local map = require('utils').map

map('n', '<leader>fb', '<cmd>Telescope buffers<cr>', { desc = 'Buffers' })
map('n', '<leader>ff', function()
  require('telescope.builtin').find_files({
    -- Exclude test/tests directories (root or nested) + node_modules
    file_ignore_patterns = { 'node_modules', '^test/', '/test/', '^tests/', '/tests/' },
  })
end, { desc = 'Find files' })
map('n', '<leader>ft', function()
  local has_fd = vim.fn.executable('fd') == 1
  local find_command
  if has_fd then
    find_command = { 'fd', '--type', 'f', '--color', 'never', '--glob', '**/test/**', '--glob', '**/tests/**' }
  else
    find_command = { 'rg', '--files', '--color', 'never', '--glob', '**/test/**', '--glob', '**/tests/**' }
  end
  require('telescope.builtin').find_files({
    find_command = find_command,
    prompt_title = 'Test Files',
  })
end, { desc = 'Test files' })
map('n', '<leader>fg', '<cmd>Telescope live_grep<cr>', { desc = 'Live grep' })
map('n', '<leader>fo', '<cmd>Telescope oldfiles<cr>', { desc = 'Old files' })
map('n', '<leader>fr', '<cmd>Telescope resume<cr>', { desc = 'Resume search' })
map('n', '<leader>fw', '<cmd>Telescope grep_string<cr>', { desc = 'Word under cursor' })
map('n', '<leader>fz', '<cmd>Telescope zoxide list<cr>', { desc = 'Directories' })
map('n', '<leader>fu', '<cmd>Telescope undo<cr>', { desc = 'Undo tree' })
map({ 'n', 'x' }, '<leader>r', '<cmd>Telescope yank_history<cr>', { desc = 'Registers' })
map('n', '<leader>k', '<cmd>Telescope keymaps<cr>', { desc = 'Keymaps' })
map('n', '<leader>fm', '<cmd>Telescope marks<cr>', { desc = 'List marks' })
map('n', '<leader>/', function()
  require('telescope.builtin').live_grep({
    grep_open_files = true,
    prompt_title = 'Grep open buffers',
  })
end, { desc = 'Search in open buffers' })
