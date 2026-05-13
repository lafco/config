--[[
  Neovim 0.12+ config using the built-in vim.pack plugin manager.
  No lazy.nvim, no external package managers.
  Plugins are cloned to ~/.local/share/nvim/site/pack/core/opt/
  Lockfile: ~/.config/nvim/nvim-pack-lock.json
]]

vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

-- Disable unused built-in plugins BEFORE they load (must be set early)
vim.g.loaded_python3_provider = 0
vim.g.loaded_ruby_provider = 0
vim.g.loaded_perl_provider = 0
vim.g.loaded_node_provider = 0

-- Disable built-in plugins we don't need (these match the old lazy.nvim rtp block)
vim.g.loaded_gzip = 1
vim.g.loaded_matchit = 1
vim.g.loaded_matchparen = 1
vim.g.loaded_tarPlugin = 1
vim.g.loaded_tohtml = 1
vim.g.loaded_tutor = 1
vim.g.loaded_zipPlugin = 1
vim.g.loaded_rplugin = 1
vim.g.loaded_man = 1
vim.g.loaded_spellfile = 1
-- Disable netrw (we use mini.files instead) — prevents FileExplorer augroup conflicts
vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1

-- Options (no plugins needed, load early)
require('options')

-- ── Plugins via vim.pack ────────────────────────────────────────────
-- First startup: plugins are cloned from Git. Subsequent: loaded from disk.
-- vim.pack.add() with load=true loads plugins immediately.
-- The lockfile ensures reproducible installs across machines.

vim.pack.add({
  -- ── LSP & Completion ────────────────────────────────────────────
  { src = 'https://github.com/neovim/nvim-lspconfig',            name = 'nvim-lspconfig' },
  { src = 'https://github.com/williamboman/mason.nvim',          name = 'mason.nvim' },
  { src = 'https://github.com/williamboman/mason-lspconfig.nvim', name = 'mason-lspconfig.nvim' },
  { src = 'https://github.com/WhoIsSethDaniel/mason-tool-installer.nvim', name = 'mason-tool-installer.nvim' },
  { src = 'https://github.com/saghen/blink.cmp',                 name = 'blink.cmp',       version = vim.version.range('1.*') },
  { src = 'https://github.com/L3MON4D3/LuaSnip',                name = 'LuaSnip',         version = vim.version.range('2.*') },
  { src = 'https://github.com/rafamadriz/friendly-snippets',     name = 'friendly-snippets' },
  { src = 'https://github.com/folke/lazydev.nvim',               name = 'lazydev.nvim' },
  { src = 'https://github.com/j-hui/fidget.nvim',                name = 'fidget.nvim' },

  -- ── Treesitter ──────────────────────────────────────────────────
  { src = 'https://github.com/nvim-treesitter/nvim-treesitter',  name = 'nvim-treesitter' },

  -- ── Format & Lint ───────────────────────────────────────────────
  { src = 'https://github.com/stevearc/conform.nvim',           name = 'conform.nvim' },
  { src = 'https://github.com/NMAC427/guess-indent.nvim',       name = 'guess-indent.nvim' },
  { src = 'https://github.com/mfussenegger/nvim-lint',          name = 'nvim-lint' },

  -- ── Telescope (fuzzy finder) ────────────────────────────────────
  { src = 'https://github.com/nvim-telescope/telescope.nvim',    name = 'telescope.nvim' },
  { src = 'https://github.com/nvim-lua/plenary.nvim',            name = 'plenary.nvim' },
  { src = 'https://github.com/debugloop/telescope-undo.nvim',    name = 'telescope-undo.nvim' },
  { src = 'https://github.com/jvgrootveld/telescope-zoxide',     name = 'telescope-zoxide' },

  -- ── UI: Theme, Statusline, Icons ────────────────────────────────
  { src = 'https://github.com/catppuccin/nvim',                  name = 'catppuccin' },
  { src = 'https://github.com/nvim-lualine/lualine.nvim',        name = 'lualine.nvim' },
  { src = 'https://github.com/echasnovski/mini.icons',           name = 'mini.icons' },

  -- ── Mini plugins ────────────────────────────────────────────────
  { src = 'https://github.com/echasnovski/mini.nvim',            name = 'mini.nvim' },

  -- ── Git ─────────────────────────────────────────────────────────
  { src = 'https://github.com/lewis6991/gitsigns.nvim',          name = 'gitsigns.nvim' },
  { src = 'https://github.com/sindrets/diffview.nvim',           name = 'diffview.nvim' },
  { src = 'https://github.com/NeogitOrg/neogit',                 name = 'neogit' },

  -- ── Navigation / Harpoon ────────────────────────────────────────
  { src = 'https://github.com/ThePrimeagen/harpoon',             name = 'harpoon',        version = 'harpoon2' },
  { src = 'https://github.com/kristoferssolo/lualine-harpoon.nvim', name = 'lualine-harpoon.nvim' },

  -- ── Which-key ───────────────────────────────────────────────────
  { src = 'https://github.com/folke/which-key.nvim',             name = 'which-key.nvim' },

  -- ── Yank ────────────────────────────────────────────────────────
  { src = 'https://github.com/gbprod/yanky.nvim',                name = 'yanky.nvim' },

  -- ── Debug ───────────────────────────────────────────────────────
  { src = 'https://github.com/andrewferrier/debugprint.nvim',    name = 'debugprint.nvim', version = vim.version.range('*') },
  { src = 'https://github.com/mfussenegger/nvim-dap',            name = 'nvim-dap' },
  { src = 'https://github.com/rcarriga/nvim-dap-ui',             name = 'nvim-dap-ui' },
  { src = 'https://github.com/nvim-neotest/nvim-nio',            name = 'nvim-nio' },
  { src = 'https://github.com/jay-babu/mason-nvim-dap.nvim',     name = 'mason-nvim-dap.nvim' },
  { src = 'https://github.com/leoluz/nvim-dap-go',              name = 'nvim-dap-go' },

  -- ── Zellij ──────────────────────────────────────────────────────
  { src = 'https://github.com/swaits/zellij-nav.nvim',           name = 'zellij-nav.nvim' },
}, { load = true })

-- ── Plugin Configuration ──────────────────────────────────────────
-- Order matters: some configs depend on others being set up first.
require('config.theme')        -- Colorscheme first
require('config.lsp')          -- LSP + Mason setup
require('config.completion')   -- blink.cmp
require('config.treesitter')
require('config.format')
require('config.lint')
require('config.telescope')
require('config.git')
require('config.mini')
require('config.lualine')
require('config.whichkey')
require('config.harpoon')
require('config.yanky')
require('config.debug')
require('config.zellij')

-- ── Keymaps & Autocommands ────────────────────────────────────────
require('keymaps')
require('autocmds')

-- vim: ts=2 sts=2 sw=2 et
