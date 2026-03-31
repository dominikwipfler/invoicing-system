const { describe, it } = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const connect = require('../lib/connect').connect;
const defs = require('../lib/defs');
const { runServer } = require('./lib/util');

function captureHandshake(url, callback) {
  let server;
  const captured = {};

  server = net.createServer((socket) => {
    socket.once('data', (_header) => {
      runServer(socket, (send, wait) => {
        send(defs.ConnectionStart, {
          versionMajor: 0,
          versionMinor: 9,
          serverProperties: {},
          mechanisms: Buffer.from('PLAIN'),
          locales: Buffer.from('en_US'),
        });
        wait(defs.ConnectionStartOk)().then((startOk) => {
          const parts = startOk.fields.response.toString().split('\0');
          captured.username = parts[1];
          captured.password = parts[2];
          send(defs.ConnectionTune, { channelMax: 0, heartbeat: 0, frameMax: 0 });
          return wait(defs.ConnectionTuneOk)();
        }).then(() => {
          return wait(defs.ConnectionOpen)();
        }).then((open) => {
          captured.vhost = open.fields.virtualHost;
          send(defs.ConnectionClose, {
            replyCode: 200,
            replyText: 'ok',
            classId: 0,
            methodId: 0,
          });
        }).catch((err) => {
          server.close();
          callback(err);
        });
      });

      socket.once('end', () => {
        server.close(() => callback(null, captured));
      });
    });
  });

  server.listen(0, () => {
    const port = server.address().port;
    const urlWithPort = url.replace('TESTPORT', String(port));
    connect(urlWithPort, {}, (_err) => {});
  });
}

describe('AMQP URI spec', () => {

  describe('credentials', () => {

    it('no userinfo defaults to guest/guest', (_t, done) => {
      captureHandshake('amqp://localhost:TESTPORT', (err, result) => {
        assert.ifError(err);
        assert.strictEqual(result.username, 'guest');
        assert.strictEqual(result.password, 'guest');
        done();
      });
    });

    it('plain user:pass', (_t, done) => {
      captureHandshake('amqp://user:pass@localhost:TESTPORT', (err, result) => {
        assert.ifError(err);
        assert.strictEqual(result.username, 'user');
        assert.strictEqual(result.password, 'pass');
        done();
      });
    });

    it('empty username', (_t, done) => {
      captureHandshake('amqp://:password@localhost:TESTPORT', (err, result) => {
        assert.ifError(err);
        assert.strictEqual(result.username, '');
        assert.strictEqual(result.password, 'password');
        done();
      });
    });

    it('empty password', (_t, done) => {
      captureHandshake('amqp://username:@localhost:TESTPORT', (err, result) => {
        assert.ifError(err);
        assert.strictEqual(result.username, 'username');
        assert.strictEqual(result.password, '');
        done();
      });
    });

    // Issue #385: colon in username or password must be percent-encoded
    it('percent-encoded colon (%3A) in username and password', (_t, done) => {
      captureHandshake('amqp://user%3Aname:pass%3Aword@localhost:TESTPORT', (err, result) => {
        assert.ifError(err);
        assert.strictEqual(result.username, 'user:name');
        assert.strictEqual(result.password, 'pass:word');
        done();
      });
    });

    // Issue #483: @ in password must be percent-encoded as %40
    it('percent-encoded @ (%40) in password', (_t, done) => {
      captureHandshake('amqp://user:p%40ssword@localhost:TESTPORT', (err, result) => {
        assert.ifError(err);
        assert.strictEqual(result.username, 'user');
        assert.strictEqual(result.password, 'p@ssword');
        done();
      });
    });

    // RabbitMQ URI spec example: amqp://user:passw%23rd@host:10000/vhost
    it('percent-encoded # (%23) in password', (_t, done) => {
      captureHandshake('amqp://user:passw%23rd@localhost:TESTPORT', (err, result) => {
        assert.ifError(err);
        assert.strictEqual(result.username, 'user');
        assert.strictEqual(result.password, 'passw#rd');
        done();
      });
    });

    it('percent-encoded % (%25) in password', (_t, done) => {
      captureHandshake('amqp://user:pass%25word@localhost:TESTPORT', (err, result) => {
        assert.ifError(err);
        assert.strictEqual(result.username, 'user');
        assert.strictEqual(result.password, 'pass%word');
        done();
      });
    });

    // RabbitMQ URI spec example: amqp://user%61:%61pass@ho%61st:10000/v%2fhost
    it('percent-encoded letters (%61 = "a") in username and password', (_t, done) => {
      captureHandshake('amqp://user%61:%61pass@localhost:TESTPORT', (err, result) => {
        assert.ifError(err);
        assert.strictEqual(result.username, 'usera');
        assert.strictEqual(result.password, 'apass');
        done();
      });
    });

  });

  describe('vhost', () => {

    it('no path defaults to vhost /', (_t, done) => {
      captureHandshake('amqp://localhost:TESTPORT', (err, result) => {
        assert.ifError(err);
        assert.strictEqual(result.vhost, '/');
        done();
      });
    });

    it('explicit / path gives vhost /', (_t, done) => {
      captureHandshake('amqp://localhost:TESTPORT/', (err, result) => {
        assert.ifError(err);
        assert.strictEqual(result.vhost, '/');
        done();
      });
    });

    it('named vhost', (_t, done) => {
      captureHandshake('amqp://localhost:TESTPORT/myvhost', (err, result) => {
        assert.ifError(err);
        assert.strictEqual(result.vhost, 'myvhost');
        done();
      });
    });

    // The RabbitMQ spec requires %2F to represent a literal / in a vhost
    it('percent-encoded slash (%2F) in vhost decodes to /', (_t, done) => {
      captureHandshake('amqp://localhost:TESTPORT/%2F', (err, result) => {
        assert.ifError(err);
        assert.strictEqual(result.vhost, '/');
        done();
      });
    });

    it('percent-encoded slash lowercase (%2f) in vhost decodes to /', (_t, done) => {
      captureHandshake('amqp://localhost:TESTPORT/%2f', (err, result) => {
        assert.ifError(err);
        assert.strictEqual(result.vhost, '/');
        done();
      });
    });

    // RabbitMQ URI spec example: /v%2fhost => "v/host"
    it('mixed percent-encoding in vhost (v%2Fhost decodes to "v/host")', (_t, done) => {
      captureHandshake('amqp://localhost:TESTPORT/v%2Fhost', (err, result) => {
        assert.ifError(err);
        assert.strictEqual(result.vhost, 'v/host');
        done();
      });
    });

    it('percent-encoded space (%20) in vhost', (_t, done) => {
      captureHandshake('amqp://localhost:TESTPORT/my%20vhost', (err, result) => {
        assert.ifError(err);
        assert.strictEqual(result.vhost, 'my vhost');
        done();
      });
    });

  });

});
