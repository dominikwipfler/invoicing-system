const crypto = require('node:crypto');
const PassThrough = require('node:stream').PassThrough;
const Connection = require('../../lib/connection').Connection;
const defs = require('../../lib/defs');
const assert = require('node:assert');

const schedule = typeof setImmediate === 'function' ? setImmediate : process.nextTick;

function randomString() {
  const hash = crypto.createHash('sha1');
  hash.update(crypto.randomBytes(64));
  return hash.digest('base64');
}

// Set up a socket pair {client, server}, such that writes to the
// client are readable from the server, and writes to the server are
// readable at the client.
//
//          +---+      +---+
//          | C |      | S |
// --write->| l |----->| e |--read-->
//          | i |      | r |
// <--read--| e |<-----| v |<-write--
//          | n |      | e |
//          | t |      | r |
//          +---+      +---+
//
// I also need to make sure that end called on either socket affects
// the other.

function socketPair() {
  const server = new PassThrough();
  const client = new PassThrough();
  server.write = client.push.bind(client);
  client.write = server.push.bind(server);
  function end(chunk, encoding) {
    if (chunk) this.push(chunk, encoding);
    this.push(null);
  }
  server.end = end.bind(client);
  client.end = end.bind(server);

  return { client: client, server: server };
}

function runServer(socket, run) {
  const frames = new Connection(socket);
  // We will be closing the socket without doing a closing handshake,
  // so cheat
  frames.expectSocketClose = true;
  // We also need to create some channel buffers, again a cheat
  frames.freshChannel(null);
  frames.freshChannel(null);
  frames.freshChannel(null);

  function send(id, fields, channel, content) {
    channel = channel || 0;
    if (content) {
      schedule(() => {
        frames.sendMessage(channel, id, fields, defs.BasicProperties, fields, content);
      });
    } else {
      schedule(() => {
        frames.sendMethod(channel, id, fields);
      });
    }
  }

  function wait(method) {
    return () =>
      new Promise((resolve, reject) => {
        if (method) {
          frames.step((e, f) => {
            if (e !== null) return reject(e);
            if (f.id === method) resolve(f);
            else reject(new Error(`Expected method: ${method}, got ${f.id}`));
          });
        } else {
          frames.step((e, f) => {
            if (e !== null) return reject(e);
            else resolve(f);
          });
        }
      });
  }
  run(send, wait);
  return frames;
}

// Create a function that will call done once it's been called itself
// `count` times. If it's called with an error value, it will
// immediately call done with that error value.
function latch(count, done) {
  let awaiting = count;
  let alive = true;
  return (err) => {
    if (err instanceof Error && alive) {
      alive = false;
      done(err);
    } else {
      awaiting--;
      if (awaiting === 0 && alive) {
        alive = false;
        done();
      }
    }
  };
}

// Call a thunk with a continuation that will be called with an error
// if the thunk throws one, or nothing if it runs to completion.
function completes(thunk, done) {
  try {
    thunk();
    done();
  } catch (e) {
    done(e);
  }
}


// When encoding, you can supply explicitly-typed fields like `{'!':
// int32, 50}`. Most of these do not appear in the decoded values, so
// to compare like-to-like we have to remove them from the input.
function removeExplicitTypes(input) {
  switch (typeof input) {
    case 'object':
      if (input == null) {
        return null;
      }
      if (Array.isArray(input)) {
        const newArr = [];
        for (let i = 0; i < input.length; i++) {
          newArr[i] = removeExplicitTypes(input[i]);
        }
        return newArr;
      }
      if (Buffer.isBuffer(input)) {
        return input;
      }
      switch (input['!']) {
        case 'timestamp':
        case 'decimal':
        case 'float':
          return input;
        case undefined: {
          const newObj = {};
          for (const k in input) {
            newObj[k] = removeExplicitTypes(input[k]);
          }
          return newObj;
        }
        default:
          return input.value;
      }

    default:
      return input;
  }
}

// Asserts that the decoded fields are equal to the original fields,
// or equal to a default where absent in the original. The defaults
// depend on the type of method or properties.
//
// This works slightly different for methods and properties: for
// methods, each field must have a value, so the default is
// substituted for undefined values when encoding; for properties,
// fields may be absent in the encoded value, so a default is
// substituted for missing fields when decoding. The effect is the
// same so far as these tests are concerned.
function assertEqualModuloDefaults(original, decodedFields) {
  const args = defs.info(original.id).args;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const originalValue = original.fields[arg.name];
    const decodedValue = decodedFields[arg.name];
    try {
      if (originalValue === undefined) {
        // longstr gets special treatment here, since the defaults are
        // given as strings rather than buffers, but the decoded values
        // will be buffers.
        assert.deepEqual(arg.type === 'longstr' ? Buffer.from(arg.default) : arg.default, decodedValue);
      } else {
        assert.deepEqual(removeExplicitTypes(originalValue), decodedValue);
      }
    } catch (assertionErr) {
      const methodOrProps = defs.info(original.id).name;
      assertionErr.message += ` (frame ${methodOrProps} field ${arg.name})`;
      throw assertionErr;
    }
  }
  // %%% TODO make sure there's no surplus fields
  return true;
}

function handshake(send, wait) {
  // kick it off
  send(defs.ConnectionStart, {
    versionMajor: 0,
    versionMinor: 9,
    serverProperties: {},
    mechanisms: Buffer.from('PLAIN'),
    locales: Buffer.from('en_US'),
  });
  return wait(defs.ConnectionStartOk)()
    .then(() => send(defs.ConnectionTune, { channelMax: 0, heartbeat: 0, frameMax: 0 }))
    .then(wait(defs.ConnectionTuneOk))
    .then(wait(defs.ConnectionOpen))
    .then(() => send(defs.ConnectionOpenOk, { knownHosts: '' }));
}

module.exports = {
  socketPair,
  runServer,
  latch,
  completes,
  schedule,
  randomString,
  removeExplicitTypes,
  assertEqualModuloDefaults,
  handshake,
};
