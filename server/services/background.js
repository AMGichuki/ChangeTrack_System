// Work we do AFTER replying to the browser (mainly sending emails), so the
// user does not wait for Gmail.
//
// On Vercel the server can be paused as soon as the reply is sent, which would
// cut an email off half way. waitUntil() tells Vercel to keep running until
// the work is finished. On a normal server (our laptop) it simply runs.
// A failure is only logged: an email problem never undoes a saved decision.
const { waitUntil } = require('@vercel/functions');

function afterResponse(label, work) {
  const task = Promise.resolve()
    .then(work)
    .catch((err) => console.error(`${label} failed:`, err.message));
  if (process.env.VERCEL) waitUntil(task);
  return task;
}

module.exports = { afterResponse };
