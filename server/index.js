// Starts the server. Run with:  npm run dev
require('dotenv').config();

const app = require('./app');
const { startReminderSchedule } = require('./services/scheduler');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`ChangeTrack API running on http://localhost:${PORT}`);
  startReminderSchedule();
});
