-- Git plugins: gitsigns, diffview, neogit

local map = require('utils').map

-- Diffview
require('diffview').setup()

-- Gitsigns
require('gitsigns').setup({
  on_attach = function(bufnr)
    local gitsigns = require('gitsigns')

    map('n', ']c', function() gitsigns.nav_hunk('next') end, { desc = 'Jump to next git change' })
    map('n', '[c', function() gitsigns.nav_hunk('prev') end, { desc = 'Jump to previous git change' })

    map('v', '<leader>hs', function() gitsigns.stage_hunk({ vim.fn.line('.'), vim.fn.line('v') }) end, { desc = 'git stage hunk' })
    map('v', '<leader>hr', function() gitsigns.reset_hunk({ vim.fn.line('.'), vim.fn.line('v') }) end, { desc = 'git reset hunk' })

    map('n', '<leader>hs', gitsigns.stage_hunk, { desc = 'Stage hunk' })
    map('n', '<leader>hu', gitsigns.undo_stage_hunk, { desc = 'Undo stage hunk' })
    map('n', '<leader>hr', gitsigns.reset_hunk, { desc = 'Reset hunk' })
    map('n', '<leader>hR', gitsigns.reset_buffer, { desc = 'Reset buffer' })
    map('n', '<leader>hp', gitsigns.preview_hunk, { desc = 'Preview hunk' })
    map('n', '<leader>hb', gitsigns.blame_line, { desc = 'Blame line' })

    map('n', '<leader>tb', gitsigns.toggle_current_line_blame, { desc = 'Git show blame line' })
    map('n', '<leader>ti', gitsigns.preview_hunk_inline, { desc = 'Git show deleted' })
  end,
})

require('neogit').setup({
  graph_style = 'unicode',
  notification_icon = '',
  signs = {
    item = { '', '' },
    section = { '', '' },
  },
  disable_commit_confirmation = true,
  kind = "vsplit",  -- abre como split vertical (permite resize com Ctrl+setas)
  mappings = {
    status = {
      ['[h'] = 'GoToPreviousHunkHeader',
      [']h'] = 'GoToNextHunkHeader',
    },
  },
  integrations = {
    telescope = true,
    diffview = true,
  },
})

-- ── ]c / [c no Neogit: pular entre arquivos (seções), não entre hunks ──
local function neogit_jump_file(direction)
  -- direction: 'n' = próximo arquivo, 'b' = arquivo anterior
  local flags = direction == 'n' and 'W' or 'bW'
  -- Padrão: linhas de seção do Neogit (começam com 2 espaços e não são hunk/comentário)
  local line = vim.fn.search('^  \S', flags)
  if line == 0 then
    local msg = direction == 'n' and 'Último arquivo' or 'Primeiro arquivo'
    vim.notify(msg, vim.log.levels.INFO, { title = 'Neogit' })
  else
    vim.cmd('normal! zt')
  end
end

vim.api.nvim_create_autocmd('FileType', {
  pattern = 'NeogitStatus',
  callback = function(args)
    local buf = args.buf
    vim.keymap.set('n', ']c', function() neogit_jump_file('n') end, { buffer = buf, desc = 'Próximo arquivo' })
    vim.keymap.set('n', '[c', function() neogit_jump_file('b') end, { buffer = buf, desc = 'Arquivo anterior' })
  end,
})

map('n', '<leader>gg', function() require('neogit').open({ kind = 'replace' }) end, { desc = 'Neogit (full screen)' })
map('n', '<leader>gb', function() require('neogit').open({ kind = 'vsplit' }) end, { desc = 'Neogit (vertical split)' })
map('n', '<leader>gv', function()
  local old = vim.o.splitbelow
  vim.o.splitbelow = true
  require('neogit').open({ kind = 'split' })
  vim.o.splitbelow = old
end, { desc = 'Neogit (bottom)' })
