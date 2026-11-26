// ROUTES: map a URL to a controller function.
const express = require('express');
const healthController = require('../controllers/healthController');

const router = express.Router();

// GET /api/health  -> is the server running and can it reach the database?
router.get('/', healthController.getHealth);

module.exports = router;
