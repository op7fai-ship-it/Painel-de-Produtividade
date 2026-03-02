import app, { initializeAdminUser, isSupabaseConfigured } from './app.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log('CORS habilitado');
  console.log('Backend conectado ao Supabase');

  if (!isSupabaseConfigured()) {
    console.warn('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para habilitar o banco.');
    return;
  }

  await initializeAdminUser();
});
