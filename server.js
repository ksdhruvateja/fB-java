// Replit dev server — runs the Express API on port 3001
import app, { initDb } from './api/app.js';

const PORT = process.env.API_PORT || 3001;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[FixBridge API] Running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[FixBridge API] DB init failed:', err.message);
    process.exit(1);
  });
