-- LSP: Uses vim.lsp.config() + vim.lsp.enable() (0.12 API) + Mason for server installs.

-- ── Suppress LSP "Press ENTER" prompts ──────────────────────────
-- window/showMessage and window/showMessageRequest often trigger the blocking
-- "Press ENTER" prompt. Redirect them to vim.notify instead.
vim.lsp.handlers['window/showMessage'] = function(err, result, ctx)
  if result and result.type == vim.lsp.protocol.MessageType.Error then
    vim.notify(result.message, vim.log.levels.ERROR, { title = 'LSP' })
  elseif result and result.type == vim.lsp.protocol.MessageType.Warning then
    vim.notify(result.message, vim.log.levels.WARN, { title = 'LSP' })
  end
  -- Info messages from LSP are silently dropped
end

vim.lsp.handlers['window/showMessageRequest'] = function(err, result, ctx)
  -- Don't block — show as non-blocking notification
  if result then
    local actions = result.actions or {}
    local msg = result.message
    vim.notify(msg, vim.log.levels.WARN, { title = 'LSP Request' })
  end
end

-- ── Global LSP config (applied to all servers) ────────────────────
vim.lsp.config('*', {
  capabilities = require('blink.cmp').get_lsp_capabilities(),
  root_markers = { '.git', 'package.json', 'lua' },
})

-- ── Server-specific overrides ─────────────────────────────────────
vim.lsp.config('ts_ls', {})
vim.lsp.config('intelephense', {
  settings = {
    intelephense = {
      files = { maxSize = 5000000 },
    },
  },
})
vim.lsp.config('lua_ls', {
  settings = {
    Lua = {
      completion = { callSnippet = 'Replace' },
    },
  },
})

-- ── Mason: auto-install LSP servers and tools ─────────────────────
require('mason').setup({})
require('mason-lspconfig').setup({
  ensure_installed = {},
  automatic_installation = false,
  handlers = {
    function(server_name)
      -- nvim-lspconfig provides lsp/<name>.lua config files.
      -- vim.lsp.enable() picks them up automatically.
      vim.lsp.enable(server_name)
    end,
  },
})

-- Install tools via Mason
require('mason-tool-installer').setup({
  ensure_installed = {
    'ts_ls',
    'lua_ls',
    'intelephense',
    'stylua',
  },
})

-- ── Fidget (LSP progress) ─────────────────────────────────────────
-- Suppress default LSP progress messages in cmdline (they trigger "Press ENTER")
require('fidget').setup({
  progress = {
    display = {
      done_icon = '✓',
      progress_icon = { pattern = 'dots', period = 1 },
    },
    -- Don't show LSP progress in the message area (fidget handles it in a popup)
    suppress_on_insert = false,
  },
  notification = {
    window = { winblend = 0 },
  },
})
-- Tell Neovim to use fidget for LSP progress, not the cmdline
vim.lsp.status = function() return '' end

-- ── LazyDev (Lua LSP for Neovim config) ───────────────────────────
require('lazydev').setup({
  library = {
    { path = '${3rd}/luv/library', words = { 'vim%.uv' } },
  },
})

-- ── LSP Attach: keymaps + features ────────────────────────────────
vim.api.nvim_create_autocmd('LspAttach', {
  group = vim.api.nvim_create_augroup('user-lsp-attach', { clear = true }),
  callback = function(event)
    local map = function(keys, func, desc, mode)
      mode = mode or 'n'
      vim.keymap.set(mode, keys, func, { buffer = event.buf, desc = 'LSP: ' .. desc })
    end

    -- Go-to
    map('gd', require('telescope.builtin').lsp_definitions, 'Definition')
    map('gD', vim.lsp.buf.declaration, 'Declaration')
    map('gi', require('telescope.builtin').lsp_implementations, 'Implementation')
    map('gr', require('telescope.builtin').lsp_references, 'References')
    map('gt', require('telescope.builtin').lsp_type_definitions, 'Type Definition')
    map('gs', require('telescope.builtin').lsp_document_symbols, 'Document Symbols')
    map('gw', require('telescope.builtin').lsp_dynamic_workspace_symbols, 'Workspace Symbols')

    -- Actions
    map('gR', vim.lsp.buf.rename, 'Rename')
    map('ga', vim.lsp.buf.code_action, 'Code Action', { 'n', 'x' })

    -- Hover / Signature (K is handled globally in debug.lua for DAP/LSP awareness)
    map('<leader>th', function()
      vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled({ bufnr = event.buf }))
    end, 'Toggle Inlay Hints')

    -- Highlight references under cursor
    local client = vim.lsp.get_client_by_id(event.data.client_id)
    if client and client:supports_method(vim.lsp.protocol.Methods.textDocument_documentHighlight, event.buf) then
      local hl_augroup = vim.api.nvim_create_augroup('user-lsp-highlight', { clear = false })
      vim.api.nvim_create_autocmd({ 'CursorHold', 'CursorHoldI' }, {
        buffer = event.buf,
        group = hl_augroup,
        callback = vim.lsp.buf.document_highlight,
      })
      vim.api.nvim_create_autocmd({ 'CursorMoved', 'CursorMovedI' }, {
        buffer = event.buf,
        group = hl_augroup,
        callback = vim.lsp.buf.clear_references,
      })
      vim.api.nvim_create_autocmd('LspDetach', {
        group = vim.api.nvim_create_augroup('user-lsp-detach', { clear = true }),
        callback = function(event2)
          vim.lsp.buf.clear_references()
          vim.api.nvim_clear_autocmds({ group = 'user-lsp-highlight', buffer = event2.buf })
        end,
      })
    end
  end,
})

-- ── Diagnostics config ────────────────────────────────────────────
vim.diagnostic.config({
  severity_sort = true,
  float = { border = 'rounded', source = 'if_many' },
  underline = { severity = vim.diagnostic.severity.ERROR },
  signs = vim.g.have_nerd_font and {
    text = {
      [vim.diagnostic.severity.ERROR] = '󰅚 ',
      [vim.diagnostic.severity.WARN] = '󰀪 ',
      [vim.diagnostic.severity.INFO] = '󰋽 ',
      [vim.diagnostic.severity.HINT] = '󰌶 ',
    },
  } or {},
  virtual_text = false, -- No inline text — avoids blocking/jank
})

-- ── Global fallback: warn when LSP keymap is used but no server is attached ──
-- Buffer-local mappings (set via LspAttach) take precedence when LSP is active.
-- These global fallbacks fire only when no LSP is attached, showing a warning.
local function lsp_or_warn(action, name)
  return function()
    if vim.lsp.get_clients({ bufnr = 0 })[1] then
      action()
    else
      vim.notify(
        'Nenhum LSP ativo — instale um servidor de linguagem via :Mason',
        vim.log.levels.WARN,
        { title = 'LSP: ' .. name }
      )
    end
  end
end
vim.keymap.set('n', 'gd', lsp_or_warn(require('telescope.builtin').lsp_definitions, 'Definition'), { desc = 'LSP: Definition' })
vim.keymap.set('n', 'gD', lsp_or_warn(vim.lsp.buf.declaration, 'Declaration'), { desc = 'LSP: Declaration' })
vim.keymap.set('n', 'gi', lsp_or_warn(require('telescope.builtin').lsp_implementations, 'Implementation'), { desc = 'LSP: Implementation' })
vim.keymap.set('n', 'gr', lsp_or_warn(require('telescope.builtin').lsp_references, 'References'), { desc = 'LSP: References' })
vim.keymap.set('n', 'gt', lsp_or_warn(require('telescope.builtin').lsp_type_definitions, 'Type Definition'), { desc = 'LSP: Type Definition' })
vim.keymap.set('n', 'gs', lsp_or_warn(require('telescope.builtin').lsp_document_symbols, 'Document Symbols'), { desc = 'LSP: Document Symbols' })
vim.keymap.set('n', 'gw', lsp_or_warn(require('telescope.builtin').lsp_dynamic_workspace_symbols, 'Workspace Symbols'), { desc = 'LSP: Workspace Symbols' })
vim.keymap.set('n', 'gR', lsp_or_warn(vim.lsp.buf.rename, 'Rename'), { desc = 'LSP: Rename' })
vim.keymap.set({ 'n', 'x' }, 'ga', lsp_or_warn(vim.lsp.buf.code_action, 'Code Action'), { desc = 'LSP: Code Action' })
