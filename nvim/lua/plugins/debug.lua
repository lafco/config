return {
  {
    "andrewferrier/debugprint.nvim",
    dependencies = {
      "nvim-mini/mini.nvim",
      "nvim-telescope/telescope.nvim",
    },
    lazy = false,
    version = "*",
    config = function() 
      local map = require('utils').map
      require('debugprint').setup({
        picker = "telescope",
        keymaps = {
          normal = {
            plain_below = "<leader>dl",
            plain_above = false,
            variable_below = "<leader>dv",
            variable_above = false,
            variable_below_alwaysprompt = false,
            variable_above_alwaysprompt = false,
            surround_plain = false,
            surround_variable = false,
            surround_variable_alwaysprompt = false,
            textobj_below = false,
            textobj_above = false,
            textobj_surround = false,
            toggle_comment_debug_prints = "<leader>td",
            delete_debug_prints = "<leader>dD",
          },
        },
      })
      map("n", "<leader>ds", ":Debugprint search <CR>", { desc = "Find debugprints" })
      map("n", "<leader>dq", ":Debugprint qflist <CR>", { desc = "Quickfix list debugprints" })
    end
  },
  {
    'mfussenegger/nvim-dap',
    dependencies = {
      'rcarriga/nvim-dap-ui',
      'nvim-neotest/nvim-nio',
      'mason-org/mason.nvim',
      'jay-babu/mason-nvim-dap.nvim',
      -- Add your own debuggers here
      'leoluz/nvim-dap-go',
    },
    keys = {
      { '<C-1', function() require('dap').continue() end, desc = 'Debug: Start/Continue' },
      { '<C-2>', function() require('dap').step_over() end, desc = 'Debug: Step Over' },
      { '<C-3>', function() require('dap').step_into() end, desc = 'Debug: Step Into' },
      { '<C-4>', function() require('dap').step_out() end, desc = 'Debug: Step Out' },
      { '<leader>dt', function() require('dap').toggle_breakpoint() end, desc = 'Debug: Toggle Breakpoint' },
      { '<leader>db', function() require('dap').set_breakpoint(vim.fn.input 'Breakpoint condition: ') end, desc = 'Debug: Set Breakpoint' },
      { '<leader>dr', function() require('dapui').toggle() end, desc = 'Debug: See last session result' },
    },
    config = function()
      local dap = require 'dap'
      local dapui = require 'dapui'
      require('mason-nvim-dap').setup {
        automatic_installation = true,
        -- see mason-nvim-dap README for more information
        handlers = {},
        ensure_installed = {
          'php',
          'delve',
        },
      }
      -- For more information, see |:help nvim-dap-ui|
      dapui.setup {
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
      }
      -- Change breakpoint icons
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
      require('dap-go').setup {
        delve = {
          -- See https://github.com/leoluz/nvim-dap-go/blob/main/README.md#configuring
          detached = vim.fn.has 'win32' == 0,
        },
      }
    end,
  }
}
