// Vercel entry point: our whole Express API runs as ONE Vercel Function.
// vercel.json sends every /api/... address here; Express then picks the route
// exactly as it does on our laptop (server/app.js). Settings come from
// Vercel's Environment Variables, not from a .env file.
module.exports = require('../server/app');
