local M = {}

-- Utility function to create autocommands
M.autocmd = vim.api.nvim_create_autocmd

-- Utility function to create augroups
M.augroup = function(name)
  return vim.api.nvim_create_augroup('augroup' .. name, { clear = true })
end

-- Utility function to set keymaps
M.map = function(mode, lhs, rhs, opts)
  opts = opts or {}
  opts.silent = opts.silent ~= false
  -- In Neovim 0.12, which-key loads lazily — check if it already captured this mapping
  vim.keymap.set(mode, lhs, rhs, opts)
end

-- Setup highlight groups
M.highlight = vim.api.nvim_set_hl

-- Check if current directory is a git repo
M.is_git_repo = function()
  local handle = io.popen('git rev-parse --is-inside-work-tree 2>/dev/null')
  if not handle then
    return false
  end
  local output = handle:read('*a')
  handle:close()
  return output:match('true') ~= nil
end

-- Check if .git directory exists
M.has_git_dir = function()
  local handle = io.popen('ls -a 2>/dev/null')
  if not handle then
    return false
  end
  local output = handle:read('*a')
  handle:close()
  return output:match('%.git') ~= nil
end

return M
