import { timingSafeEqual } from 'node:crypto';
import { HttpError, hasAccess } from './rules.mjs';
export const CHECKOUTS = Object.freeze({monthly:'https://go.perfectpay.com.br/PPU38CQHE7N',annual:'https://go.perfectpay.com.br/PPU38CQHE7P'});
export const CODES = Object.freeze({monthly:'PPU38CQHE7N',annual:'PPU38CQHE7P'});
export function authenticatePostback(payload, secret) {
  const received = payload?.token;
  if (typeof received !== 'string' || typeof secret !== 'string' || !secret || Buffer.byteLength(received)!==Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(received),Buffer.from(secret))) throw new HttpError(401,'INVALID_WEBHOOK_TOKEN','Webhook não autorizado.');
}
export function parsePerfectPayEvent(payload) {
  const plan = Object.keys(CODES).find(k=>CODES[k]===payload?.plan?.code);
  const email = payload?.customer?.email?.trim().toLowerCase();
  const code = payload?.code;
  const status = payload?.sale_status_enum;
  if (!plan || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof code !== 'string' || !/^[a-zA-Z0-9_-]{5,100}$/.test(code) || !Number.isInteger(status)) throw new HttpError(422,'INVALID_SALE','Venda inválida ou plano não reconhecido.');
  // Perfect Pay reports approved=2 and completed=10; authorized=8 is NOT settled.
  const kind = [2,10].includes(status)?'paid':[6,7,9].includes(status)?'reversed':'ignored';
  const date = payload.date_approved || payload.date_created;
  const stamp = typeof date==='string' ? Date.parse(date.replace(' ','T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(date)?'':'-03:00')) : NaN;
  if (kind!=='ignored' && !Number.isFinite(stamp)) throw new HttpError(422,'INVALID_DATE','Data da venda ausente ou inválida.');
  return {plan,email,code,status,kind,at:Number.isFinite(stamp)?new Date(stamp).toISOString():null};
}
export function periodEnd(at,plan) {
  const d=new Date(at); const day=d.getUTCDate(); d.setUTCDate(1);
  if(plan==='monthly') d.setUTCMonth(d.getUTCMonth()+1); else d.setUTCFullYear(d.getUTCFullYear()+1);
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  d.setUTCDate(Math.min(day,last)); return d.toISOString();
}
export async function perfectPayCheckout(user,plan,{repo}) {
  if (!user.email || !user.email_confirmed_at) throw new HttpError(403,'EMAIL_NOT_VERIFIED','Confirme seu e-mail antes de assinar.');
  const row=await repo.getSubscription(user.id);
  if (hasAccess(row)) throw new HttpError(409,'SUBSCRIPTION_EXISTS','Você já possui acesso ativo.');
  return {url:CHECKOUTS[plan]};
}
export async function perfectPayWebhook(payload,{repo,config}) {
  authenticatePostback(payload,config.perfectPayToken);
  const event=parsePerfectPayEvent(payload);
  if(event.kind==='ignored') return {received:true,ignored:true};
  // Match ONLY a pre-existing, verified Supabase account by email. Never create users from untrusted postbacks.
  const user=await repo.findVerifiedUserByEmail(event.email);
  if(!user) throw new HttpError(409,'ACCOUNT_NOT_FOUND','Conta verificada não encontrada para o e-mail da compra.');
  const result=await repo.applyPerfectPayEvent(typeof user === 'string' ? user : user.id,event);
  return {received:true,...result};
}
