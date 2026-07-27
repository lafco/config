-- Keymaps — global mappings that don't depend on LSP attach.

local map = require('utils').map

-- better up/down (visual line mode)
map({ 'n', 'x' }, 'j', "v:count == 0 ? 'gj' : 'j'", { desc = 'Down', expr = true, silent = true })
map({ 'n', 'x' }, '<Down>', "v:count == 0 ? 'gj' : 'j'", { desc = 'Down', expr = true, silent = true })
map({ 'n', 'x' }, 'k', "v:count == 0 ? 'gk' : 'k'", { desc = 'Up', expr = true, silent = true })
map({ 'n', 'x' }, '<Up>', "v:count == 0 ? 'gk' : 'k'", { desc = 'Up', expr = true, silent = true })

-- Split windows
map('n', '<C-w>v', '<cmd>vsplit<cr>', { desc = 'Vertical Split' })
map('n', '<C-w>b', '<cmd>belowright split<cr>', { desc = 'Horizontal Split (bottom)' })

-- Window navigation (Ctrl+hjkl moves focus, like Ctrl-w hjkl)
map('n', '<C-h>', '<C-w>h', { desc = 'Go to Left Window' })
map('n', '<C-j>', '<C-w>j', { desc = 'Go to Lower Window' })
map('n', '<C-k>', '<C-w>k', { desc = 'Go to Upper Window' })
map('n', '<C-l>', '<C-w>l', { desc = 'Go to Right Window' })

-- Resize windows
map('n', '<C-Up>', '<cmd>resize +2<cr>', { desc = 'Increase Window Height' })
map('n', '<C-Down>', '<cmd>resize -2<cr>', { desc = 'Decrease Window Height' })
map('n', '<C-Left>', '<cmd>vertical resize +2<cr>', { desc = 'Increase Window Width' })
map('n', '<C-Right>', '<cmd>vertical resize -2<cr>', { desc = 'Decrease Window Width' })

-- Move lines in insert mode
map('i', '<A-j>', '<esc><cmd>m .+1<cr>==gi', { desc = 'Move Down' })
map('i', '<A-k>', '<esc><cmd>m .-2<cr>==gi', { desc = 'Move Up' })

-- Delete without yanking (black hole register)
map({ 'n', 'x' }, 'x', '"_x', { desc = 'Delete without yank' })
map({ 'n', 'x' }, 'X', '"_X', { desc = 'Delete backwards without yank' })

-- Buffers
map('n', '[b', '<cmd>bprevious<cr>', { desc = 'Prev Buffer' })
map('n', ']b', '<cmd>bnext<cr>', { desc = 'Next Buffer' })
map('n', '<C-x>', '<cmd>q<cr>', { desc = 'Close buffer' })
map('n', '<C-q>', '<cmd>q<cr>', { desc = 'Close buffer' })
map('n', '<leader>bn', '<cmd>enew<cr>', { desc = 'New File' })
map('n', '<leader>bd', '<cmd>:bd<cr>', { desc = 'Delete Buffer and Window' })

-- Escape clears search highlight
map({ 'i', 'n', 's' }, '<esc>', function()
  vim.cmd('noh')
  return '<esc>'
end, { expr = true, desc = 'Escape and Clear hlsearch' })

-- Better n/N (keep cursor centered)
map('n', 'n', "'Nn'[v:searchforward].'zv'", { expr = true, desc = 'Next Search Result', silent = true })
map('x', 'n', "'Nn'[v:searchforward]", { expr = true, desc = 'Next Search Result', silent = true })
map('o', 'n', "'Nn'[v:searchforward]", { expr = true, desc = 'Next Search Result', silent = true })
map('n', 'N', "'nN'[v:searchforward].'zv'", { expr = true, desc = 'Prev Search Result', silent = true })
map('x', 'N', "'nN'[v:searchforward]", { expr = true, desc = 'Prev Search Result', silent = true })
map('o', 'N', "'nN'[v:searchforward]", { expr = true, desc = 'Prev Search Result', silent = true })

-- Undo breakpoints on punctuation
map('i', ',', ',<c-g>u')
map('i', '.', '.<c-g>u')
map('i', ';', ';<c-g>u')

-- Save file
map({ 'i', 'x', 'n', 's' }, '<C-s>', '<cmd>w<cr><esc>', { desc = 'Save File' })

-- Better scroll (center after scroll)
map('n', '<C-d>', '<C-d>zz', { desc = 'Center cursor after scroll down' })
map('n', '<C-u>', '<C-u>zz', { desc = 'Center cursor after scroll up' })

-- Better indenting (keep selection)
map('x', '<', '<gv')
map('x', '>', '>gv')

-- Commenting (with mini.ai + gcc from treesitter)
map('n', 'gco', "o<esc>Vcx<esc><cmd>normal gcc<cr>fxa<bs>", { desc = 'Add Comment Below' })
map('n', 'gcO', "O<esc>Vcx<esc><cmd>normal gcc<cr>fxa<bs>", { desc = 'Add Comment Above' })

-- Quickfix list
map('n', '<leader>q', function()
  local success, _ = pcall(function()
    if vim.fn.getqflist({ winid = 0 }).winid ~= 0 then
      vim.cmd.cclose()
    else
      vim.cmd.copen()
    end
  end)
end, { desc = 'Quickfix List' })
map('n', '[q', vim.cmd.cprev, { desc = 'Previous Quickfix' })
map('n', ']q', vim.cmd.cnext, { desc = 'Next Quickfix' })

-- Go to file (native gf remapped)
map('n', 'go', function()
  vim.cmd('normal! gf')
end, { desc = 'Go to file' })

-- Search word under cursor (like * / #)
map('n', '[n', '#', { desc = 'Prev word under cursor' })
map('n', ']n', '*', { desc = 'Next word under cursor' })

-- Search with word under cursor (editable before executing)
map('n', 'gs', function()
  local word = vim.fn.expand('<cword>')
  vim.fn.feedkeys('/\\<' .. vim.pesc(word) .. '\\>', 'n')
end, { desc = 'Search word forward (editable)' })
map('n', 'gw', function()
  local word = vim.fn.expand('<cword>')
  vim.fn.feedkeys('?\\<' .. vim.pesc(word) .. '\\>', 'n')
end, { desc = 'Search word backward (editable)' })

-- Messages: view auto-dismissed messages (Neovim 0.12 messagesopt wait:1)
map('n', '<leader>tm', function()
  local output = vim.fn.execute('messages')
  if output == '' or output == '\n' then
    vim.notify('No messages', vim.log.levels.INFO)
    return
  end
  local lines = vim.split(output:gsub('\n$', ''), '\n')
  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  vim.bo[buf].buftype = 'nofile'
  vim.bo[buf].modifiable = false
  vim.bo[buf].bufhidden = 'wipe'
  vim.bo[buf].filetype = 'messages'
  local height = math.min(math.max(#lines + 2, 6), 30)
  vim.cmd('botright ' .. height .. 'split')
  vim.api.nvim_win_set_buf(0, buf)
  vim.keymap.set('n', 'q', '<cmd>close<cr>', { buffer = buf, silent = true, desc = 'Close messages' })
end, { desc = 'Show Message history' })

-- File explorer (mini.files)
map('n', '<leader>e', '<Cmd>lua MiniFiles.open(vim.api.nvim_buf_get_name(0))<CR>', { desc = 'Open file explorer' })

-- Prdbook: open knowledge base directory
vim.api.nvim_create_user_command('Prdbook', function()
  vim.cmd('cd ~/prdbook')
  require('mini.files').open('~/prdbook')
end, { desc = 'Open prdbook knowledge base' })
map('n', '<leader>fp', '<cmd>Staging<cr>', { desc = 'Open prdbook staging' })

-- Prdbook staging: open feature staging folder
vim.api.nvim_create_user_command('Staging', function()
  vim.cmd('cd ~/prdbook/staging')
  require('mini.files').open('~/prdbook/staging')
end, { desc = 'Open staging folder' })
map('n', '<leader>fs', '<cmd>Staging<cr>', { desc = 'Open staging folder' })

-- Diagnostics navigation
local diagnostic_goto = function(next, severity)
  return function()
    vim.diagnostic.jump({
      count = (next and 1 or -1) * vim.v.count1,
      severity = severity and vim.diagnostic.severity[severity] or nil,
      float = true,
    })
  end
end
map('n', '<leader>l', vim.diagnostic.open_float, { desc = 'Line Diagnostics' })
map('n', ']d', diagnostic_goto(true), { desc = 'Next Diagnostic' })
map('n', '[d', diagnostic_goto(false), { desc = 'Prev Diagnostic' })
