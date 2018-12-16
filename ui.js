const neatLog = require('neat-log')
const blit = require('txt-blit')

const termWidth = process.stdout.columns
const termHeight = process.stdout.rows

const view = (state) => {
  var screen = []

  blit(screen, drawBoxOutline(termWidth, 10), 0, termHeight-10)

  return screen.join('\n')
}

const neat = neatLog(view, { fullscreen: true })
neat.use(mainloop)


function drawBoxOutline (w, h) {
  const endRow = new Array(w).fill('#').join('')

  let bodyRow = new Array(w).fill(' ')
  bodyRow[0] = '#'
  bodyRow[w-1] = '#'
  bodyRow = bodyRow.join('')

  let rows = new Array(h).fill(bodyRow)
  rows[0] = endRow
  rows[h-1] = endRow

  return rows
}

function mainloop (state, bus) {
  bus.emit('render')
}
