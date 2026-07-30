const { PassThrough } = require('stream');
const handler = require('./api/bookings.js');

const req = new PassThrough();
req.method = 'GET';
req.url = '/api/bookings';

const res = new PassThrough();
res.setHeader = function (name, value) {
  this.headers = this.headers || {};
  this.headers[name] = value;
};
res.writeHead = function (status, headers) {
  this.statusCode = status;
  this.headers = { ...(this.headers || {}), ...headers };
};
res.end = function (body) {
  console.log('END status', this.statusCode);
  console.log('headers', this.headers);
  console.log('body', body.toString());
};

handler(req, res).catch((err) => {
  console.error('HANDLER ERROR', err);
});
