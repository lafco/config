-- Linting via nvim-lint — debounced, non-blocking.
-- Previously linted on every BufEnter/BufWritePost/InsertLeave.
-- Now debounced: only runs 500ms after you stop typing or on save.

local lint = require('lint')

-- Define linters by filetype (empty = no linting)
-- To enable: install the tool, then add it here, e.g.:
--   markdown = { 'markdownlint' }   -- requires: npm i -g markdownlint-cli
--   python = { 'ruff' }             -- requires: pip install ruff
lint.linters_by_ft = {}

-- Debounced lint: runs after idle, not on every keystroke
local lint_timer = nil
local DEBOUNCE_MS = 500

local function debounced_lint(bufnr)
  if lint_timer then
    lint_timer:close()
  end
  lint_timer = vim.defer_fn(function()
    lint_timer = nil
    -- Only lint modifiable buffers (skip LSP hover, etc.)
    if vim.bo[bufnr].modifiable then
      lint.try_lint()
    end
  end, DEBOUNCE_MS)
end

vim.api.nvim_create_autocmd({ 'BufEnter', 'BufWritePost', 'InsertLeave', 'TextChanged' }, {
  group = vim.api.nvim_create_augroup('user-lint', { clear = true }),
  callback = function(args)
    -- args.buf is the buffer number, guaranteed to exist for these events
    debounced_lint(args.buf)
  end,
})
