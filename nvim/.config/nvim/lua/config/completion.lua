-- blink.cmp: Fast LSP-powered completion. Configured for minimal blocking.
-- In Neovim 0.12, you could also use vim.lsp.completion.enable() as a lighter alternative.

require('blink.cmp').setup({
  keymap = { preset = 'default' },
  appearance = {
    nerd_font_variant = 'normal',
  },
  completion = {
    -- Don't auto-show documentation (avoids LSP requests on every item)
    documentation = { auto_show = false, auto_show_delay_ms = 1000 },
    -- Limit menu items for performance
    menu = {
      draw = {
        columns = { { 'kind_icon' }, { 'label', 'label_description', gap = 1 }, { 'kind' } },
      },
    },
  },
  sources = {
    default = { 'lsp', 'path', 'snippets', 'lazydev' },
    providers = {
      lazydev = { module = 'lazydev.integrations.blink', score_offset = 100 },
    },
  },
  snippets = { preset = 'luasnip' },
  fuzzy = { implementation = 'lua' },
  signature = { enabled = true },
  -- Não mostrar menu de comandos ao pressionar ':'
  cmdline = { enabled = false },
})

-- Load friendly-snippets into LuaSnip
require('luasnip.loaders.from_vscode').lazy_load()
