-- Adds git related signs to the gutter, as well as utilities for managing changes
-- NOTE: gitsigns is already included in init.lua but contains only the base
-- config. This will add also the recommended keymaps.

return {
	{
		"sindrets/diffview.nvim",
		cmd = { "DiffviewOpen", "DiffviewClose", "DiffviewToggleFiles", "DiffviewFocusFiles" },
		dependencies = "nvim-lua/plenary.nvim",
		config = function()
			require("diffview").setup()
		end,
	},
	{
		"lewis6991/gitsigns.nvim",
		opts = {
			on_attach = function(bufnr)
				local gitsigns = require("gitsigns")
				local map = require("utils").map

				-- hunk navigation
				map("n", "]c", function() gitsigns.nav_hunk("next") end, { desc = "Jump to next git change" })
				map("n", "[c", function() gitsigns.nav_hunk("prev") end, { desc = "Jump to previous git change" })

				-- visual mode
				map("v", "<leader>hs", function() gitsigns.stage_hunk({ vim.fn.line("."), vim.fn.line("v") }) end, { desc = "git stage hunk" })
				map("v", "<leader>hr", function() gitsigns.reset_hunk({ vim.fn.line("."), vim.fn.line("v") }) end, { desc = "git reset hunk" })

				-- normal mode
				map("n", "<leader>hs", gitsigns.stage_hunk, { desc = "Stage hunk" })
				map("n", "<leader>hu", gitsigns.undo_stage_hunk, { desc = "Undo stage hunk" })
				map("n", "<leader>hr", gitsigns.reset_hunk, { desc = "Reset hunk" })
				map("n", "<leader>hR", gitsigns.reset_buffer, { desc = "Reset buffer" })
				map("n", "<leader>hp", gitsigns.preview_hunk, { desc = "Preview hunk" })
				map("n", "<leader>hb", gitsigns.blame_line, { desc = "Blame line" })

				-- Toggles
				map("n", "<leader>tb", gitsigns.toggle_current_line_blame, { desc = "Git show blame line" })
				map("n", "<leader>ti", gitsigns.preview_hunk_inline, { desc = "Git show deleted" })
			end,
		},
	},
	{
		"NeogitOrg/neogit",
		cmd = "Neogit",
		keys = {
			{ "<leader>gg", "<cmd>Neogit<cr>", desc = "Neogit" },
		},
		dependencies = {
			"nvim-lua/plenary.nvim",
			"nvim-telescope/telescope.nvim",
			"sindrets/diffview.nvim",
		},
		config = true,
		opts = {
			graph_style = "unicode",
			notification_icon = "",
			signs = {
				item = { "", "" },
				section = { "", "" },
			},
			disable_commit_confirmation = true,
			integrations = {
				telescope = true,
				diffview = true,
			},
		},
	},
}
