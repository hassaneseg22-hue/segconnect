import fs from 'fs';
import readline from 'readline';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;

  const content = fs.readFileSync(path, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('❌ Configuration Supabase manquante');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Mot de passe du compte DG : ', async (password) => {
  rl.close();

  const supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'darksnoow@gmail.com',
    password,
  });

  if (error) {
    console.error('❌ Authentification Supabase échouée');
    console.error(error.message);
    process.exit(1);
  }

  console.log('✅ Authentification Supabase réussie');
  console.log(`UUID  : ${data.user.id}`);
  console.log(`Email : ${data.user.email}`);
  console.log(`Session : ${data.session ? 'CRÉÉE' : 'ABSENTE'}`);

  await supabase.auth.signOut();
  console.log('✅ Session de test fermée');
});
