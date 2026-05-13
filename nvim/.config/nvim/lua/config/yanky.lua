-- Yanky: better yank/paste highlighting and put behavior.

local map = require('utils').map

require('yanky').setup({
  highlight = {
    on_put = true,
    on_yank = true,
    timer = 200,
  },
})

map({ 'n', 'x' }, 'y', '<Plug>(YankyYank)', { desc = 'Yank and stay' })
map('n', ']p', '<Plug>(YankyPutIndentAfterLinewise)', { desc = 'Paste after' })
map('n', '[p', '<Plug>(YankyPutIndentBeforeLinewise)', { desc = 'Paste before' })
map('n', ']P', '<Plug>(YankyPutIndentAfterLinewise)', { desc = 'Paste after' })
map('n', '[P', '<Plug>(YankyPutIndentBeforeLinewise)', { desc = 'Paste before' })

map('n', '>p', '<Plug>(YankyPutIndentAfterShiftRight)', { desc = 'Shift and paste after' })
map('n', '<p', '<Plug>(YankyPutIndentAfterShiftLeft)', { desc = 'Shift and paste after' })
map('n', '>P', '<Plug>(YankyPutIndentBeforeShiftRight)', { desc = 'Shift and paste before' })
map('n', '<P', '<Plug>(YankyPutIndentBeforeShiftLeft)', { desc = 'Shift and paste before' })

map('n', '=p', '<Plug>(YankyPutAfterFilter)', { desc = 'Reindent and paste after' })
map('n', '=P', '<Plug>(YankyPutBeforeFilter)', { desc = 'Reindent and paste before' })
