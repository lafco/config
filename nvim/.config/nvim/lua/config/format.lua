-- Formatting via conform.nvim — async, non-blocking.

require('conform').setup({
  notify_on_error = false,
  format_on_save = false, -- Explicit format only (<leader>c), never on save
  formatters_by_ft = {
    lua = { 'stylua' },
    rust = { 'rustfmt' },
    -- python = { 'isort', 'black' },
    -- javascript = { 'prettierd', 'prettier', stop_after_first = true },
  },
})

-- guess-indent: auto-detect indentation
require('guess-indent').setup({})

-- Keymap: format current buffer
vim.keymap.set('n', '<leader>c', function()
  require('conform').format({ async = true, lsp_format = 'fallback' })
end, { desc = 'Format buffer' })
