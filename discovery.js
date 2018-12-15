var discovery = require('discovery-swarm')

var swarm = discovery()

let nickname = 'aral' +  Math.floor(Math.random() * 42) + 1

swarm.join('my-p2p-app-bozo-the-clown')

swarm.on('connection', function (connection, info) {
  console.log('found a peer', info)

  process.stdin.on('data', function (data) {
    connection.write(JSON.stringify({
      type: 'chat-message',
      nickname,
      text: data.toString().trim(),
      timestamp: new Date().toISOString()
    }))
  })

  connection.on('data', function (data) {
    data = JSON.parse(data)
    console.log(`${data.timestamp} ${data.nickname}: ${data.text}`)
  })
})
