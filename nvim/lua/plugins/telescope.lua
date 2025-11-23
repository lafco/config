return {
	{
		"nvim-telescope/telescope.nvim",
		lazy = true,
		keys = {
			{ "<leader>fb", "<cmd>Telescope buffers<cr>", desc = "Buffers" },
			{ "<leader>ff", "<cmd>Telescope find_files<cr>", desc = "Find files" },
			{ "<leader>fg", "<cmd>Telescope live_grep<cr>", desc = "Live grep" },
			{ "<leader>fo", "<cmd>Telescope oldfiles<cr>", desc = "Old files" },
			{ "<leader>fr", "<cmd>Telescope resume<cr>", desc = "Resume search" },
			{ "<leader>fw", "<cmd>Telescope grep_string<cr>", desc = "Word under cursor" },
			{ "<leader>fz", "<cmd>Telescope zoxide list<cr>", desc = "Directories" },
			{ "<leader>fu", "<cmd>Telescope undo<cr>", desc = "Undo" },

			{ "<leader>r", "<cmd>Telescope yank_history<cr>", mode = { "n", "x" }, desc = "Registers" },
			{ "<leader>k", "<cmd>Telescope keymaps<cr>", desc = "Keymaps" },
      { '<leader>fm', '<cmd>Telescope marks<cr>', desc = 'List marks' },
			{ "<leader>/", function() require("telescope.builtin").live_grep({ grep_open_files = true, prompt_title = "Grep open buffers" }) end, desc = "Search in open buffers" },
		},
		dependencies = {
			"nvim-lua/plenary.nvim",
			"debugloop/telescope-undo.nvim",
			"jvgrootveld/telescope-zoxide",
		},
		config = function()
			local actions = require("telescope.actions")
			require("telescope").setup({
				defaults = {
					selection_caret = "▎ ",
					multi_icon = " │ ",
					winblend = 0,
					borderchars = { "─", "│", "─", "│", "┌", "┐", "┘", "└" },
					mappings = {
						i = {
							["<C-d>"] = actions.preview_scrolling_down,
							["<C-u>"] = actions.preview_scrolling_up,
							["<c-enter>"] = "to_fuzzy_refine",
						},
						n = {
							["q"] = require("telescope.actions").close,
							["<C-d>"] = actions.preview_scrolling_down,
							["<C-u>"] = actions.preview_scrolling_up,
						},
					},
					layout_config = {
						prompt_position = "top",
						preview_width = 0.56,
						width = 0.87,
						height = 0.70,
					},
					sorting_strategy = "ascending",
					file_ignore_patterns = { "node_modules" },
				},
				pickers = {
					buffers = {
						mappings = {
							n = {
								["<C-e>"] = "delete_buffer",
								["l"] = "select_default",
							},
						},
						initial_mode = "normal",
					},
				},
				extensions = {
					undo = {
						initial_mode = "normal",
						layout_config = {
							preview_width = 0.7,
						},
					},
					advanced_git_search = {
						diff_plugin = "diffview",
						keymaps = {
							toggle_date_author = "<C-w>",
							open_commit_in_browser = "<C-o>",
							copy_commit_hash = "<C-y>",
							copy_commit_patch = "<C-h>",
							show_entire_commit = "<C-e>",
						},
					},
				},
			})
			require("telescope").load_extension("undo")
			require("telescope").load_extension("zoxide")
			require("telescope").load_extension("yank_history")
		end,
	},
}
