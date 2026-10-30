import { HttpError } from './rules.mjs';

export async function readRawBody(req, limit = 1024 * 1024) {
  // Do NOT read req.body here: Vercel's lazy getter consumes/parses the stream.
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new HttpError(413, 'BODY_TOO_LARGE', 'A solicitação excede o tamanho permitido.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req) {
  if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'JSON_REQUIRED', 'Envie a solicitação no formato JSON.');
  }
  let body;
  try {
    body = req.body;
    if (body === undefined) body = (await readRawBody(req, 16 * 1024)).toString('utf8');
    if (Buffer.isBuffer(body)) body = body.toString('utf8');
    if (typeof body === 'string') body = JSON.parse(body);
    if (Buffer.byteLength(JSON.stringify(body) ?? '') > 16 * 1024) throw new HttpError(413, 'BODY_TOO_LARGE', 'A solicitação excede o tamanho permitido.');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'INVALID_JSON', 'Não foi possível ler a solicitação.');
  }
  return body;
}

export async function requireUser(req, authenticate) {
  const header = req.headers.authorization;
  const match = typeof header === 'string' && header.match(/^Bearer ([^\s]+)$/i);
  if (!match) throw new HttpError(401, 'AUTH_REQUIRED', 'Entre na sua conta para continuar.');
  const user = await authenticate(match[1]);
  if (!user?.id) throw new HttpError(401, 'INVALID_SESSION', 'Sua sessão expirou. Entre novamente.');
  return user;
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

export function errorResponse(res, error) {
  const known = error instanceof HttpError;
  if (!known) console.error('api_request_failed', { type: error?.type ?? error?.name ?? 'Error', code: error?.code ?? 'unknown' });
  if (known && error.status === 503) res.setHeader('Retry-After', '5');
  return json(res, known ? error.status : 503, {
    error: known ? error.message : 'Não foi possível concluir a solicitação. Tente novamente em instantes.',
    code: known ? error.code : 'SERVICE_UNAVAILABLE',
  });
}

export function route(method, handler) {
  return async (req, res) => {
    try {
      if (req.method !== method) {
        res.setHeader('Allow', method);
        throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');
      }
      return json(res, 200, await handler(req));
    } catch (error) { return errorResponse(res, error); }
  };
}
