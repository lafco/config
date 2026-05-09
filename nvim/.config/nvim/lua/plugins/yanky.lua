return {
  {
    "gbprod/yanky.nvim",
    config = function()
      require('yanky').setup({
        highlight = {
          on_put = true,
          on_yank = true,
          timer = 200,
        },
      })
      local map = require("utils").map

      map({"n","x"}, "y", "<Plug>(YankyYank)", { desc = "Yank and dont move cursor" })
      --Linewise put: this will force put above or below the current line
      map("n", "]p", "<Plug>(YankyPutIndentAfterLinewise)", { desc = "Paste after" })
      map("n", "[p", "<Plug>(YankyPutIndentBeforeLinewise)", { desc = "Paste before" })
      map("n", "]P", "<Plug>(YankyPutIndentAfterLinewise)", { desc = "Paste after" })
      map("n", "[P", "<Plug>(YankyPutIndentBeforeLinewise)", { desc = "Paste before" })

      --Shift right/left put: will put above or below the current line and increasing or decreasing indent
      map("n", ">p", "<Plug>(YankyPutIndentAfterShiftRight)", { desc = "Shift and paste after" })
      map("n", "<p", "<Plug>(YankyPutIndentAfterShiftLeft)", { desc = "Shift and paste after" })
      map("n", ">P", "<Plug>(YankyPutIndentBeforeShiftRight)", { desc = "Shift and paste before" })
      map("n", "<P", "<Plug>(YankyPutIndentBeforeShiftLeft)", { desc = "Shift and paste before" })

      --Filter put: will put above or below the current line and reindenting
      map("n", "=p", "<Plug>(YankyPutAfterFilter)", { desc = "Reident and paster after" })
      map("n", "=P", "<Plug>(YankyPutBeforeFilter)", { desc = "Reident and paster before" })
    end
  }
}
