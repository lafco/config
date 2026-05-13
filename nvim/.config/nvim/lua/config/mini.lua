-- Mini plugins: ai, pairs, files, indentscope, move

-- Mini.ai — better around/inside textobjects (va), yinq, ci')
require('mini.ai').setup({ n_lines = 500 })

-- Mini.pairs — auto-close brackets, quotes, etc.
require('mini.pairs').setup()

-- Mini.files — file explorer (<leader>e)
-- Neovim 0.12: mini.files tries to clear the FileExplorer augroup (from netrw).
-- Even with netrw disabled and `silent!`, the E216 error leaks and triggers the
-- blocking "Press ENTER" prompt when cmdheight=0. Create a dummy augroup first
-- so the deletion always succeeds.
pcall(vim.api.nvim_create_augroup, 'FileExplorer', { clear = true })
require('mini.files').setup()

-- Mini.indentscope — visualize indentation scope
require('mini.indentscope').setup()

-- Mini.move — move lines/selections with Alt+hjkl
require('mini.move').setup({
  mappings = {
    left = '<M-h>',
    right = '<M-l>',
    down = '<M-j>',
    up = '<M-k>',
    line_left = '<M-h>',
    line_right = '<M-l>',
    line_down = '<M-j>',
    line_up = '<M-k>',
  },
})

-- Mini.surround — add/delete/replace surroundings
-- require('mini.surround').setup() -- uncomment if needed
