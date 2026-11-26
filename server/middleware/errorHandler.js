// One place that turns any error into a clean JSON reply.
// Full details go to the server console only, never to the browser.
function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    status: 'error',
    message: status === 500 ? 'Something went wrong on the server.' : err.message,
  });
}

module.exports = errorHandler;
