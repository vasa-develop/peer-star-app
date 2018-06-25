# peer-star-app

Peer-Star App support

## Install

```bash
$ npm install peer-star-app
```

## Import

```js
const PeerStar = require('peer-star-app')
```

## API

### Create app

```js
const app = PeerStar('app name')
```

### Start app

```js
await app.start()
```

### Create collaboration

```js
const collaboration = await app.collaborate('collaboration name')

// stop collaboration
await collaboration.stop()
```

### Peer count estimate

Returns estimate of peers in app.

```js
app.peerCountEstimate()
```

### Collaboration

#### Events:

```js
collaboration.on('peer joined', (peerId) => {
  console.log('peer joined:', peerId)
})
```

```js
collaboration.on('peer left', (peerId) => {
  console.log('peer left:', peerId)
})
```

### Stop app

```js
await app.stop()
```

### Guess peer count

```js
app.peerCountGuess() // returns integer Number >= 0
```


# License

MIT
