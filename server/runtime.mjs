import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
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
let stripe;
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
  if (['checkout', 'portal', 'webhook'].includes(name)) {
    stripe ??= new Stripe(required('STRIPE_SECRET_KEY'), {
      maxNetworkRetries: 1, timeout: 15_000,
    });
    deps.stripe = stripe;
    if (name !== 'webhook') deps.config.appUrl = appUrl();
    if (name !== 'portal') {
      const monthly = required('STRIPE_PRICE_MONTHLY');
      const annual = required('STRIPE_PRICE_ANNUAL');
      if (!/^price_[a-zA-Z0-9_]+$/.test(monthly) || !/^price_[a-zA-Z0-9_]+$/.test(annual) || monthly === annual) {
        throw new HttpError(503, 'PRICE_CONFIGURATION', 'O pagamento está temporariamente indisponível. Tente novamente mais tarde.');
      }
      deps.config.prices = { monthly, annual };
    }
    if (name === 'webhook') deps.config.webhookSecret = required('STRIPE_WEBHOOK_SECRET');
  }
  return deps;
}

export function endpoint(name) {
  return async (req, res) => {
    try { return await createHandlers(runtime(name))[name](req, res); }
    catch (error) { return errorResponse(res, error); }
  };
}
