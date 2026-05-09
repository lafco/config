return {
  {
    "nvim-lualine/lualine.nvim",
    VeryLazy = true,
    dependencies = {
      "nvim-mini/mini.icons",
      "kristoferssolo/lualine-harpoon.nvim",
      dependencies = {
        { "ThePrimeagen/harpoon", branch = "harpoon2" }
      },
    },
    config = function()
      require("mini.icons").setup()
      require("mini.icons").mock_nvim_web_devicons()
      
      local function get_current_colorscheme_colors()
        local colorscheme = vim.g.colors_name or "default"
        
        if string.find(colorscheme, "tokyonight") then
          return require("tokyonight.colors").setup()
        elseif string.find(colorscheme, "catppuccin") then
          local palette = require("catppuccin.palettes").get_palette()
          -- Map catppuccin colors to tokyonight-like structure
          return {
            bg = palette.base,
            text = palette.text,
            blue = palette.blue,
            black = palette.crust,
            yellow = palette.yellow,
            bg_float = palette.mantle
          }
        else
          -- Fallback colors
          return {
            bg = "#1e1e2e",
            text = "#cdd6f4",
            blue = "#89b4fa",
            black = "#11111b",
            yellow = "#f9e2af",
            bg_float = "#181825"
          }
        end
      end
      
      local colors = get_current_colorscheme_colors()
      require('lualine').setup({
        sections = {
          lualine_c = {
            "filename",
            "harpoon",
          },
        },
        options = {
          theme = {
            normal = {
              a = {bg = colors.bg, fg = colors.text, gui = 'bold'},
              b = {bg = colors.bg, fg = colors.text},
              c = {bg = colors.bg, fg = colors.text}
            },
            insert = {
              a = {bg = colors.blue, fg = colors.black, gui = 'bold'},
            },
            visual = {
              a = {bg = colors.yellow, fg = colors.black, gui = 'bold'},
            },
          },
          component_separators = { left = "│", right = "│" },
          section_separators = { left = "", right = "" },
          globalstatus = true,
          refresh = {
            statusline = 100,
          },
        },
      })
    end
  },
}
