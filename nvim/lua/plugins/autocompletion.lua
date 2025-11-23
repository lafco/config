return {
  {
    'saghen/blink.cmp',
    event = 'VimEnter',
    version = '1.*',
    dependencies = {
      {
        'L3MON4D3/LuaSnip',
        version = '2.*',
        build = (function()
          if vim.fn.has 'win32' == 1 or vim.fn.executable 'make' == 0 then
            return
          end
          return 'make install_jsregexp'
        end)(),
        dependencies = {
          {
            'rafamadriz/friendly-snippets',
            config = function()
              require('luasnip.loaders.from_vscode').lazy_load()
            end,
          },
        },
        opts = {},
      },
      'folke/lazydev.nvim',
    },
    --- @module 'blink.cmp'
    --- @type blink.cmp.Config
    opts = {
      keymap = {
        -- <c-y> to accept ([y]es) the completion.
        -- <tab>/<s-tab>: move to right/left of your snippet expansion
        -- <c-space>: Open menu or open docs if already open
        -- <c-n>/<c-p> or <up>/<down>: Select next/previous item
        -- <c-e>: Hide menu
        -- <c-k>: Toggle signature help
        preset = 'default',
      },
      appearance = {
        nerd_font_variant = 'normal',
        -- kind_icons = {
        --   Text = "󰉿",
        --   Method = "󰆧",
        --   Function = "󰊕",
        --   Constructor = "",
        --   Field = "󰜢",
        --   Variable = "󰀫",
        --   Class = "󰠱",
        --   Interface = "",
        --   Module = "",
        --   Property = "󰜢",
        --   Unit = "󰑭",
        --   Value = "󰎠",
        --   Enum = "",
        --   Keyword = "󰌋",
        --   Snippet = "",
        --   Color = "󰏘",
        --   File = "󰈙",
        --   Reference = "󰈇",
        --   Folder = "󰉋",
        --   EnumMember = "",
        --   Constant = "󰏿",
        --   Struct = "󰙅",
        --   Event = "",
        --   Operator = "󰆕",
        --   TypeParameter = "",
        --   String = "󰀬",
        --   Number = "󰎠",
        --   Boolean = "⊨",
        --   Array = "󰅪",
        --   Object = "󰅩",
        --   Key = "󰌋",
        --   Null = "󰟢",
        --   Package = "󰏗",
        --   Namespace = "󰌗",
        --   Macro = "󰁌",
        --   Error = "",
        --   Warning = "",
        --   Information = "",
        --   Hint = "󰌶",
        -- },
        -- draw = function(entry, ctx)
        --   local text = entry.label or entry.word or ""
        --   local icon = ctx.kind_icon or ""
          
        --   -- Format as: "text icon"
        --   return string.format("%s %s", text, icon)
        -- end,
      },
      completion = {
        documentation = { auto_show = false, auto_show_delay_ms = 1000 },
        -- menu = {
        --   max_items = 5,
        -- }
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
    },
  }
}
