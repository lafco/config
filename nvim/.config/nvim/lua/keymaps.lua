local map = require("utils").map

-- better up/down
map({ "n", "x" }, "j", "v:count == 0 ? 'gj' : 'j'", { desc = "Down", expr = true, silent = true })
map({ "n", "x" }, "<Down>", "v:count == 0 ? 'gj' : 'j'", { desc = "Down", expr = true, silent = true })
map({ "n", "x" }, "k", "v:count == 0 ? 'gk' : 'k'", { desc = "Up", expr = true, silent = true })
map({ "n", "x" }, "<Up>", "v:count == 0 ? 'gk' : 'k'", { desc = "Up", expr = true, silent = true })

-- Move to window using the <ctrl> hjkl keys
map("n", "<C-h>", "<cmd>ZellijNavigateLeftTab<cr>", { desc = "Go to Left Window", remap = true })
map("n", "<C-j>", "<cmd>ZellijNavigateDown<cr>", { desc = "Go to Lower Window", remap = true })
map("n", "<C-k>", "<cmd>ZellijNavigateUp<cr>", { desc = "Go to Upper Window", remap = true })
map("n", "<C-l>", "<cmd>ZellijNavigateRightTab<cr>", { desc = "Go to Right Window", remap = true })

-- Resize window using <ctrl> arrow keys
map("n", "<C-Up>", "<cmd>resize +2<cr>", { desc = "Increase Window Height" })
map("n", "<C-Down>", "<cmd>resize -2<cr>", { desc = "Decrease Window Height" })
map("n", "<C-Left>", "<cmd>vertical resize -2<cr>", { desc = "Decrease Window Width" })
map("n", "<C-Right>", "<cmd>vertical resize +2<cr>", { desc = "Increase Window Width" })

-- Insert nove lines
map("i", "<A-j>", "<esc><cmd>m .+1<cr>==gi", { desc = "Move Down" })
map("i", "<A-k>", "<esc><cmd>m .-2<cr>==gi", { desc = "Move Up" })

-- better hunk find
map("n", "[h", "<cmd>bprevious<cr>", { desc = "Prev Buffer" })
map("n", "]h", "<cmd>bnext<cr>", { desc = "Next Buffer" })

-- buffers
map("n", "[b", "<cmd>bprevious<cr>", { desc = "Prev Buffer" })
map("n", "]b", "<cmd>bnext<cr>", { desc = "Next Buffer" })
map("n", "<C-x>", "<cmd>q<cr>", { desc = "Close buffer"})
map("n", "<C-q>", "<cmd>q<cr>", { desc = "Close buffer"})
map("n", "<leader>bn", "<cmd>enew<cr>", { desc = "New File" })
map("n", "<leader>bd", "<cmd>:bd<cr>", { desc = "Delete Buffer and Window" })

-- Clear search and stop snippet on escape
map({ "i", "n", "s" }, "<esc>", function()
	vim.cmd("noh")
	return "<esc>"
end, { expr = true, desc = "Escape and Clear hlsearch" })

-- https://github.com/mhinz/vim-galore#saner-behavior-of-n-and-n
map("n", "n", "'Nn'[v:searchforward].'zv'", { expr = true, desc = "Next Search Result", silent = true })
map("x", "n", "'Nn'[v:searchforward]", { expr = true, desc = "Next Search Result", silent = true })
map("o", "n", "'Nn'[v:searchforward]", { expr = true, desc = "Next Search Result", silent = true })
map("n", "N", "'nN'[v:searchforward].'zv'", { expr = true, desc = "Prev Search Result", silent = true })
map("x", "N", "'nN'[v:searchforward]", { expr = true, desc = "Prev Search Result", silent = true })
map("o", "N", "'nN'[v:searchforward]", { expr = true, desc = "Prev Search Result", silent = true })

-- Add undo break-points
map("i", ",", ",<c-g>u")
map("i", ".", ".<c-g>u")
map("i", ";", ";<c-g>u")

-- save file
map({ "i", "x", "n", "s" }, "<C-s>", "<cmd>w<cr><esc>", { desc = "Save File" })

-- better scroll
map("n", "<C-d>", "<C-d>zz", {desc = "Center cursor after scroll down"})
map("n", "<C-u>", "<C-u>zz", {desc = "Center cursor after scroll up"})

-- better indenting
map("x", "<", "<gv")
map("x", ">", ">gv")

-- commenting
map("n", "gco", "o<esc>Vcx<esc><cmd>normal gcc<cr>fxa<bs>", { desc = "Add Comment Below" })
map("n", "gcO", "O<esc>Vcx<esc><cmd>normal gcc<cr>fxa<bs>", { desc = "Add Comment Above" })

-- quickfix list
map("n", "<leader>q", function()
	local success, err = pcall(vim.fn.getqflist({ winid = 0 }).winid ~= 0 and vim.cmd.cclose or vim.cmd.copen)
end, { desc = "Quickfix List" })
map("n", "[q", vim.cmd.cprev, { desc = "Previous Quickfix" })
map("n", "]q", vim.cmd.cnext, { desc = "Next Quickfix" })

-- explorer
map("n", "<leader>e", "<Cmd>lua MiniFiles.open(vim.api.nvim_buf_get_name(0))<CR>", { desc = "Open file explorer" })

-- diagnostic
local diagnostic_goto = function(next, severity)
	return function()
		vim.diagnostic.jump({
			count = (next and 1 or -1) * vim.v.count1,
			severity = severity and vim.diagnostic.severity[severity] or nil,
			float = true,
		})
	end
end
map("n", "<leader>l", vim.diagnostic.open_float, { desc = "Line Diagnostics" })
map("n", "]d", diagnostic_goto(true), { desc = "Next Diagnostic" })
map("n", "[d", diagnostic_goto(false), { desc = "Prev Diagnostic" })
