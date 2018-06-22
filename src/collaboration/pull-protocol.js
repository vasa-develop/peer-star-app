'use strict'

const debug = require('debug')('peer-star:collaboration:pull-protocol')
const pull = require('pull-stream')
const pushable = require('pull-pushable')
const vectorclock = require('vectorclock')
const Queue = require('p-queue')
const handlingData = require('../common/handling-data')
const encode = require('../common/encode')

module.exports = class PullProtocol {
  constructor (ipfs, store, options) {
    this._ipfs = ipfs
    this._store = store
    this._options = options
  }

  forPeer (peerInfo) {
    const remotePeerId = peerInfo.id.toB58String()
    debug('%s: pull protocol to %s', this._peerId(), remotePeerId)
    const queue = new Queue({ concurrency: 1 })
    let ended = false
    let waitingForClock = null
    let timeout

    const onNewClock = (clock) => {
      debug('%s got new clock from state:', this._peerId(), clock)
      // TODO: only send difference from previous clock
      output.push(encode([clock]))
    }
    this._store.on('clock changed', onNewClock)

    const onData = (err, data) => {
      if (err) {
        onEnd(err)
        return
      }

      debug('%s got new data from %s :', this._peerId(), remotePeerId, data)

      queue.add(async () => {
        const [clock, state] = data
        if (clock) {
          if (state) {
            if (waitingForClock &&
                (vectorclock.isIdentical(waitingForClock, clock) ||
                 vectorclock.compare(waitingForClock, clock) < 0)) {
              // We received what we were waiting for, so we can clear the timeout
              waitingForClock = null
              if (timeout) {
                clearTimeout(timeout)
              }
            }
            if (await this._store.contains(clock)) {
              // we already have this state
              // send a "prune" message
              debug('%s: setting %s to lazy mode', this._peerId(), remotePeerId)
              output.push(encode([null, true]))
            } else {
              const saved = await this._store.saveState([clock, state])
              if (!saved) {
                debug('%s: did not save', this._peerId())
                debug('%s: setting %s to lazy mode', this._peerId(), remotePeerId)
                output.push(encode([null, true]))
              } else {
                debug('%s: saved with new clock %j', this._peerId(), saved)
              }
            }
          } else {
            // Only got the vector clock, which means that this connection
            //   is on lazy mode.
            // We must wait a bit to see if we get the data this peer has
            //   from any other peer.
            // If not, we should engage eager mode
            waitingForClock = vectorclock.merge(waitingForClock || {}, clock)
            if (timeout) {
              clearTimeout(timeout)
              timeout = null
            }
            timeout = setTimeout(() => {
              timeout = null
              // are we still waiting for this clock?
              if (waitingForClock &&
                  (vectorclock.isIdentical(waitingForClock, clock) ||
                  vectorclock.compare(waitingForClock, clock) < 0)) {
                debug('%s: timeout happened for clock', this._peerId(), waitingForClock)
                output.push(encode([null, false, true]))
              }
            }, this._options.receiveTimeout)
            // timeout and maybe turn into eager mode?
          }
        }
      }).catch(onEnd)

      return true // keep the stream alive
    }

    const onEnd = (err) => {
      if (!ended) {
        if (err) {
          console.error('%s: pull conn to %s ended with error', this._peerId(), remotePeerId, err.message)
          debug('%s: conn to %s ended with error', this._peerId(), remotePeerId, err)
        }
        ended = true
        this._store.removeListener('clock changed', onNewClock)
        output.end(err)
      }
    }
    const input = pull.drain(handlingData(onData), onEnd)
    const output = pushable()

    this._store.getLatestClock()
      .then((vectorClock) => {
        debug('%s: sending latest vector clock to %s:', this._peerId(), remotePeerId, vectorClock)
        output.push(encode([vectorClock]))
      })
      .catch(onEnd)

    return { sink: input, source: output }
  }

  _peerId () {
    if (!this._cachedPeerId) {
      this._cachedPeerId = this._ipfs._peerInfo.id.toB58String()
    }
    return this._cachedPeerId
  }
}
