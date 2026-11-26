// CONTROLLER: receives the HTTP request, asks the Model, sends the answer.
const healthModel = require('../models/healthModel');

async function getHealth(req, res, next) {
  try {
    const database = await healthModel.checkDatabase();
    res.json({ status: 'ok', database });
  } catch (err) {
    next(err);
  }
}

module.exports = { getHealth };
