import app, { initializeAdminUser, isSupabaseConfigured } from '../backend/src/app.js';

let adminInitialized = false;

export default async function handler(req, res) {
  if (!adminInitialized && isSupabaseConfigured()) {
    adminInitialized = true;
    await initializeAdminUser();
  }

  return app(req, res);
}
