-- Set to true if you have a Nerd Font installed and selected in the terminal
vim.g.have_nerd_font = true

vim.opt.clipboard = 'unnamedplus' -- Sync with system clipboard
vim.opt.completeopt = 'menu,menuone,noselect'
vim.opt.conceallevel = 2
vim.opt.confirm = true
vim.opt.cursorline = true
vim.opt.expandtab = true
vim.opt.fillchars = {
  foldopen = '',
  foldclose = '',
  fold = ' ',
  foldsep = ' ',
  diff = '╱',
  eob = ' ',
}
vim.opt.foldlevel = 99
vim.opt.foldmethod = 'indent'
vim.opt.foldtext = ''
vim.opt.ignorecase = true
vim.opt.inccommand = 'nosplit'
vim.opt.cmdheight = 0

-- Neovim 0.12: 'messagesopt' replaces hit-enter prompt with silent auto-dismiss.
-- Default: "hit-enter,history:500,progress:c" → we swap hit-enter for wait:0
vim.opt.messagesopt = 'history:500,progress:c,wait:1'
vim.opt.jumpoptions = 'view'
vim.opt.laststatus = 3 -- global statusline
vim.opt.linebreak = true
vim.opt.list = true
vim.opt.mouse = ''
vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.ruler = false
vim.opt.scrolloff = 4
vim.opt.sessionoptions = { 'buffers', 'curdir', 'tabpages', 'winsize', 'help', 'globals', 'skiprtp', 'folds' }
vim.opt.shiftround = true
vim.opt.shiftwidth = 2
-- T truncates messages instead of "Press ENTER" prompt (critical with cmdheight=0)
-- A suppresses ATTENTION swap-file prompts
-- F suppresses "file changed" prompts
-- S suppresses search-hit-BOTTOM prompts
vim.opt.shortmess:append({ W = true, I = true, c = true, C = true, T = true, A = true, F = true, S = true })
vim.opt.showmode = false
vim.opt.sidescrolloff = 12
vim.opt.signcolumn = 'yes'
vim.opt.smartcase = true
vim.opt.smartindent = true
vim.opt.smoothscroll = true
vim.opt.spelllang = { 'en' }
vim.opt.splitbelow = true
vim.opt.splitkeep = 'screen'
vim.opt.splitright = true
vim.opt.tabstop = 2
vim.opt.termguicolors = true
vim.opt.timeoutlen = 300
vim.opt.undofile = true
vim.opt.undolevels = 10000
vim.opt.updatetime = 200
vim.opt.virtualedit = 'block'
vim.opt.wildmode = 'longest:full,full'
vim.opt.winminwidth = 5
vim.opt.wrap = false

-- Neovim 0.12: improved popup menu border
vim.opt.pumborder = 'single'
