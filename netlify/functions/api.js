// Netlify serverless function — same Express app wrapped for Lambda
import serverless from 'serverless-http';
import app, { initDb } from '../../api/app.js';

let ready = false;
const serverlessHandler = serverless(app);

export const handler = async (event, context) => {
  if (!ready) {
    await initDb();
    ready = true;
  }
  return serverlessHandler(event, context);
};
