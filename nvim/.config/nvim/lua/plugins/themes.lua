return {
	{
		"catppuccin/nvim",
		name = "catppuccin",
		priority = 1000,
		config = function()
			require("catppuccin").setup({
				flavour = "mocha",
				no_italic = true,
				no_underline = true,
				integrations = {
					cmp = true,
					gitsigns = true,
					diffview = true,
					neogit = true,
					dap = true,
					dap_ui = true,
					which_key = true,
				},
				custom_highlights = function(colors)
					return {
						-- Visual = { fg = colors.mantle, bg = colors.red },
						TelescopeSelectionCaret = { fg = colors.red, bg = colors.mantle },
						TelescopePromptPrefix = { fg = colors.red, bg = colors.crust },
						TelescopeMatching = { fg = colors.red },
						TelescopeSelection = { fg = colors.blue, bg = colors.mantle },
						TelescopePromptNormal = { bg = colors.crust },
						TelescopePromptBorder = { bg = colors.crust, fg = colors.crust },
						TelescopePromptTitle = { fg = colors.crust, bg = colors.red },
						TelescopeResultsNormal = { bg = colors.mantle },
						TelescopeResultsBorder = { bg = colors.mantle, fg = colors.mantle },
						TelescopeResultsTitle = { fg = colors.crust, bg = colors.green },
						TelescopePreviewNormal = { bg = colors.crust },
						TelescopePreviewBorder = { bg = colors.crust, fg = colors.crust },
						TelescopePreviewTitle = { fg = colors.crust, bg = colors.blue },
						-- https://cmp.saghen.dev/configuration/appearance.html
					}
				end,
			})
			vim.cmd.colorscheme("catppuccin")
		end,
	},
}
