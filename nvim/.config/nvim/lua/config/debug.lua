-- Debug: nvim-dap + debugprint

local map = require('utils').map

-- ── Debugprint ─────────────────────────────────────────────────────
require('debugprint').setup({
  picker = 'telescope',
  keymaps = {
    normal = {
      plain_below = '<leader>dl',
      plain_above = false,
      variable_below = '<leader>dv',
      variable_above = false,
      variable_below_alwaysprompt = false,
      variable_above_alwaysprompt = false,
      surround_plain = false,
      surround_variable = false,
      surround_variable_alwaysprompt = false,
      textobj_below = false,
      textobj_above = false,
      textobj_surround = false,
      toggle_comment_debug_prints = '<leader>td',
      delete_debug_prints = '<leader>dD',
    },
  },
})
map('n', '<leader>ds', ':Debugprint search<CR>', { desc = 'Find debugprints' })
map('n', '<leader>dq', ':Debugprint qflist<CR>', { desc = 'Quickfix list debugprints' })

-- ── nvim-dap ───────────────────────────────────────────────────────
local dap = require('dap')
local dapui = require('dapui')

require('mason-nvim-dap').setup({
  automatic_installation = true,
  handlers = {},
  ensure_installed = { 'php', 'delve', 'js-debug-adapter' },
})

dapui.setup({
  icons = { expanded = '▾', collapsed = '▸', current_frame = '*' },
  controls = {
    icons = {
      pause = '⏸',
      play = '▶',
      step_into = '⏎',
      step_over = '⏭',
      step_out = '⏮',
      step_back = 'b',
      run_last = '▶▶',
      terminate = '⏹',
      disconnect = '⏏',
    },
  },
})

-- Breakpoint icons
vim.api.nvim_set_hl(0, 'DapBreak', { fg = '#e51400' })
vim.api.nvim_set_hl(0, 'DapStop', { fg = '#ffcc00' })
local breakpoint_icons = vim.g.have_nerd_font
    and { Breakpoint = '', BreakpointCondition = '', BreakpointRejected = '', LogPoint = '', Stopped = '' }
  or { Breakpoint = '●', BreakpointCondition = '⊜', BreakpointRejected = '⊘', LogPoint = '◆', Stopped = '⭔' }
for type, icon in pairs(breakpoint_icons) do
  local tp = 'Dap' .. type
  local hl = (type == 'Stopped') and 'DapStop' or 'DapBreak'
  vim.fn.sign_define(tp, { text = icon, texthl = hl, numhl = hl })
end

dap.listeners.after.event_initialized['dapui_config'] = dapui.open
dap.listeners.before.event_terminated['dapui_config'] = dapui.close
dap.listeners.before.event_exited['dapui_config'] = dapui.close

require('dap-go').setup({
  delve = {
    detached = vim.fn.has('win32') == 0,
  },
})

-- ── Language-specific debug configurations ─────────────────────────
dap.configurations.javascript = {
  -- Launch: debug the current file directly
  {
    type = 'pwa-node',
    request = 'launch',
    name = 'Launch current file',
    program = '${file}',
    cwd = '${workspaceFolder}',
    sourceMaps = true,
    resolveSourceMapLocations = { '${workspaceFolder}/**', '!**/node_modules/**' },
  },
  -- Launch: debug the main app (src/bin/www)
  {
    type = 'pwa-node',
    request = 'launch',
    name = 'Launch rostering-api',
    program = '${workspaceFolder}/src/bin/www',
    cwd = '${workspaceFolder}',
    env = { NODE_ENV = 'development' },
    console = 'integratedTerminal',
  },
  -- Attach: connect to running --inspect process (port 9229 default, or 1029 as in nodemon-start)
  {
    type = 'pwa-node',
    request = 'attach',
    name = 'Attach to process (port 9229)',
    port = 9229,
    cwd = '${workspaceFolder}',
    sourceMaps = true,
  },
  {
    type = 'pwa-node',
    request = 'attach',
    name = 'Attach to process (port 1029)',
    port = 1029,
    cwd = '${workspaceFolder}',
    sourceMaps = true,
  },
  -- Test: debug Jest (current file)
  {
    type = 'pwa-node',
    request = 'launch',
    name = 'Debug Jest (current file)',
    runtimeExecutable = 'npx',
    runtimeArgs = { 'jest', '--runInBand', '--no-coverage', '${file}' },
    cwd = '${workspaceFolder}',
    console = 'integratedTerminal',
    env = { NODE_ENV = 'test' },
  },
}
dap.configurations.typescript = dap.configurations.javascript

-- Debug keymaps
map('n', '<C-1>', function() dap.continue() end, { desc = 'Debug: Start/Continue' })
map('n', '<C-2>', function() dap.step_over() end, { desc = 'Debug: Step Over' })
map('n', '<C-3>', function() dap.step_into() end, { desc = 'Debug: Step Into' })
map('n', '<C-4>', function() dap.step_out() end, { desc = 'Debug: Step Out' })
map('n', '<leader>dt', function() dap.toggle_breakpoint() end, { desc = 'Debug: Toggle Breakpoint' })
map('n', '<leader>db', function() dap.set_breakpoint(vim.fn.input('Breakpoint condition: ')) end, { desc = 'Debug: Set Breakpoint' })
map('n', '<leader>dr', function() dapui.toggle() end, { desc = 'Debug: See last session result' })
