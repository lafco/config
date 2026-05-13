-- Harpoon: quick file marks (ThePrimeagen/harpoon v2)

local map = require('utils').map
local harpoon = require('harpoon')

harpoon:setup()

-- Telescope integration for harpoon list
local conf = require('telescope.config').values
local function toggle_telescope(harpoon_files)
  local file_paths = {}
  for _, item in ipairs(harpoon_files.items) do
    table.insert(file_paths, item.value)
  end
  require('telescope.pickers').new({}, {
    prompt_title = 'Harpoon',
    finder = require('telescope.finders').new_table({ results = file_paths }),
    previewer = conf.file_previewer({}),
    sorter = conf.generic_sorter({}),
  }):find()
end

map('n', '<leader>fh', function() toggle_telescope(harpoon:list()) end, { desc = 'Harpoon List' })
map('n', '<leader>a', function() harpoon:list():add() end, { desc = 'Mark file' })

-- Quick file access (Alt+1..6)
for i = 1, 6 do
  map('n', '<A-' .. i .. '>', function() harpoon:list():select(i) end)
end

map('n', '<A-p>', function() harpoon:list():prev() end)
map('n', '<A-n>', function() harpoon:list():next() end)
map('n', '<A-x>', function() harpoon:list():remove() end)
