// This recreates the key-value view presented in
// Exercise 14 (but using the feed key from a
// kappa-core feed, as per the example in the
// kappa-core-kv readme.

const memdb = require('memdb')
const kappaCore = require('kappa-core')
const kappaViewKeyValue = require('kappa-view-kv')

const inMemoryDatabase = memdb()

keyValueIndex = kappaViewKeyValue(
  // Storage
  inMemoryDatabase,

  // Mapping function
  (message, next) => {
  if (!message.value.id) return next

  const operations = []
  const messageId = `${message.key}@${message.seq/*uence*/}`

  operations.push({
    key: message.value.id,
    id: messageId,
    links: message.value.links || []
  })

  next(null, ops)
  }
)

const core = kappaCore('./kappa-view-kv-core', { valueEncoding: 'json' })

core.use('kv', keyValueIndex)

let feedKeyInHex = null
core.feed('local', (error, feed) => {

  feedKeyInHex = feed.key.toString('hex')

  const messages = [
    {
        key: feedKeyInHex,
        value: 'bar',
        links: []
    },
    {
      key: feedKeyInHex,
      value: 'test',
      links: []
    },
    {
      key: feedKeyInHex,
      value: 'quux',
      links: []
    }
  ]

  feed.append(messages[0], (error, sequence0) => {
    if (error) throw error

    // 2nd message links to the first.
    messages[1].links.push(version(feed, sequence0))
    feed.append(messages[1], (error, sequence1) => {

      if (error) throw error
      // 3rd message also links to the first.
      messages[2].links.push(version(feed, sequence0))
      feed.append(messages[2], (error, sequence2) => {
        if (error) throw error

        core.api.kv.get(feedKeyInHex, (error, values) => {
          if (error) throw error
          console.log(`kv for ${kFeedKEy}`, values)
        })
      })
    })
  })
})

function version (feed, sequence) {
  return feed.key.toString('hex') + '@' + sequence
}
