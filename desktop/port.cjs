const net = require('node:net');

function availablePort(preferred = 0) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => {
      if (preferred && ['EADDRINUSE', 'EACCES'].includes(error.code))
        availablePort().then(resolve, reject);
      else reject(error);
    });
    server.listen(preferred, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}
module.exports = { availablePort };
