const neatLog = require('neat-log')
const blit = require('txt-blit')

const neat = neatLog(view, { fullscreen: true })
neat.use(mainloop)

const termWidth = process.stdout.columns
const termHeight = process.stdout.rows

function view (state) {
  var screen = []

  var x = Math.floor(termWidth / 2) + state.xOffset
  var y = Math.floor(termHeight /2)
  blit(screen, ['HELLO WORLD'], x, y)

  return screen.join('\n')
}

function mainloop (state, bus) {
  state.xOffset = 0
  setInterval(function () {
    state.xOffset = Math.floor(Math.sin(new Date().getTime() / 500) * 20)
    bus.emit('render')
  }, 5)
}
