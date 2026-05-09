return {
  {
    "ThePrimeagen/harpoon",
    branch = "harpoon2",
    dependencies = { "nvim-lua/plenary.nvim" },
    config = function()
      local map = require('utils').map
      local harpoon = require("harpoon")
      harpoon:setup()

      local conf = require("telescope.config").values
      local function toggle_telescope(harpoon_files)
        local file_paths = {}
        for _, item in ipairs(harpoon_files.items) do
            table.insert(file_paths, item.value)
        end
        require("telescope.pickers").new({}, {
            prompt_title = "Harpoon",
            finder = require("telescope.finders").new_table({
              results = file_paths,
            }),
            previewer = conf.file_previewer({}),
            sorter = conf.generic_sorter({}),
        }):find()
      end

      map("n", "<leader>fh", function() toggle_telescope(harpoon:list()) end, { desc = "Harpoon List" })
      map("n", "<leader>a", function() harpoon:list():add() end, { desc = "Mark file" })
      map("n", "<A-1>", function() harpoon:list():select(1) end)
      map("n", "<A-2>", function() harpoon:list():select(2) end)
      map("n", "<A-3>", function() harpoon:list():select(3) end)
      map("n", "<A-4>", function() harpoon:list():select(4) end)
      map("n", "<A-5>", function() harpoon:list():select(5) end)
      map("n", "<A-6>", function() harpoon:list():select(6) end)
      map("n", "<A-p>", function() harpoon:list():prev() end)
      map("n", "<A-n>", function() harpoon:list():next() end)
      map("n", "<A-x>", function() harpoon:list():remove() end)
    end
  }
}
