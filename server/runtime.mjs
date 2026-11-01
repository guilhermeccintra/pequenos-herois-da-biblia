import { createClient } from '@supabase/supabase-js';
import { createHandlers } from './handlers.mjs';
import { errorResponse } from './http.mjs';
import { createRepository } from './repository.mjs';
import { HttpError } from './rules.mjs';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new HttpError(503, 'SERVER_CONFIGURATION', 'Este serviço ainda não está configurado. Tente novamente mais tarde.');
  return value;
}

function appUrl() {
  let url;
  try { url = new URL(required('APP_URL')); } catch { /* validated below */ }
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new HttpError(503, 'SERVER_CONFIGURATION', 'Este serviço ainda não está configurado. Tente novamente mais tarde.');
  }
  return url.origin;
}

let supabase;
function runtime(name) {
  supabase ??= createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const deps = {
    repo: createRepository(supabase),
    async authenticate(token) {
      // getUser verifies the bearer with Supabase Auth; decoding a JWT alone is insufficient.
      const { data, error } = await supabase.auth.getUser(token);
      if (error) {
        if (error.status >= 500 || error.name === 'AuthRetryableFetchError') throw error;
        return null;
      }
      return data.user;
    },
    config: {},
  };
  if (name === 'webhook') deps.config.perfectPayToken = required('PERFECTPAY_WEBHOOK_TOKEN');
  return deps;
}

export function endpoint(name) {
  return async (req, res) => {
    try { return await createHandlers(runtime(name))[name](req, res); }
    catch (error) { return errorResponse(res, error); }
  };
}
