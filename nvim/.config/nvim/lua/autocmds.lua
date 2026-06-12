-- Autocommands — global automation.

local autocmd = require('utils').autocmd
local augroup = require('utils').augroup

-- Highlight yanked text
autocmd('TextYankPost', {
  desc = 'Highlight yanked text',
  group = augroup('yank_highlight'),
  callback = function()
    vim.highlight.on_yank({ timeout = 200 })
  end,
})

-- Zellij: lock on focus gained, unlock on focus lost
autocmd({ 'FocusGained', 'VimEnter' }, {
  desc = 'Lock zellij when nvim is focused',
  group = augroup('zellij_lock'),
  pattern = '*',
  command = 'silent !zellij action switch-mode locked',
})

autocmd({ 'FocusLost', 'VimLeave' }, {
  desc = 'Unlock zellij when nvim loses focus',
  group = augroup('zellij_unlock'),
  pattern = '*',
  command = 'silent !zellij action switch-mode normal',
})

-- Close certain windows with 'q'
autocmd('FileType', {
  desc = 'Close with q',
  group = augroup('close_with_q'),
  pattern = { 'checkhealth', 'help', 'lspinfo', 'man', 'notify', 'qf', 'query', 'nvim-pack' },
  callback = function(event)
    vim.bo[event.buf].buflisted = false
    vim.keymap.set('n', 'q', '<cmd>close<cr>', { buffer = event.buf, silent = true })
  end,
})

-- Jump to last position when opening a file
autocmd('BufReadPost', {
  desc = 'Jump to last position',
  group = augroup('last_position'),
  callback = function()
    local mark = vim.api.nvim_buf_get_mark(0, '"')
    local line_count = vim.api.nvim_buf_line_count(0)
    if mark[1] > 0 and mark[1] <= line_count then
      pcall(vim.api.nvim_win_set_cursor, 0, mark)
    end
  end,
})

-- Neogit: resize commit message to 70% when staged diff opens below
autocmd('FileType', {
  desc = 'Neogit commit editor: 70/30 split',
  group = augroup('neogit_commit_resize'),
  pattern = 'gitcommit',
  callback = function()
    vim.defer_fn(function()
      local diff_win = vim.fn.win_getid(vim.fn.winnr('j'))
      if diff_win == 0 then return end
      local diff_ft = vim.bo[vim.api.nvim_win_get_buf(diff_win)].filetype
      if diff_ft == 'NeogitDiffView' then
        vim.api.nvim_win_set_height(0, math.floor(vim.o.lines * 0.7))
      end
    end, 50)
  end,
})
