// Builds the Express app: settings, routes and error handling.
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const requestRoutes = require('./routes/requestRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const studentRoutes = require('./routes/studentRoutes');
const cronRoutes = require('./routes/cronRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// On Railway our app sits behind a proxy. This makes req.ip the visitor's real
// address, so the sign-in limits count each visitor separately.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

// Basic browser security settings for every reply.
app.disable('x-powered-by'); // do not advertise that we use Express
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); // do not guess file types
  res.setHeader('X-Frame-Options', 'DENY'); // our pages cannot be hidden inside another site
  res.setHeader('Referrer-Policy', 'same-origin'); // reset links are not leaked to other sites
  next();
});

// Only our React app may call this API from a browser.
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

// Routes (more are added each sprint: auth, requests, approvals, admin...)
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/cron', cronRoutes); // daily reminder check on the live site

// Unknown API address
app.use('/api', (req, res) => res.status(404).json({ status: 'error', message: 'Not found' }));

// LIVE SERVER: Express also serves the built React app (client/dist), so the
// whole system runs from ONE web address. Any page address that is not /api
// gets index.html, and React Router shows the right screen.
const CLIENT_BUILD = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(path.join(CLIENT_BUILD, 'index.html'))) {
  app.use(express.static(CLIENT_BUILD, { index: false, maxAge: '7d' }));
  app.get('/{*page}', (req, res, next) => {
    if (path.extname(req.path)) return next(); // a missing file (e.g. .js) is a real 404, not a page
    res.setHeader('Cache-Control', 'no-cache'); // always fetch the newest version of the app
    res.sendFile(path.join(CLIENT_BUILD, 'index.html'));
  });
}

// Anything else
app.use((req, res) => res.status(404).json({ status: 'error', message: 'Not found' }));

// Errors (must be last)
app.use(errorHandler);

module.exports = app;
