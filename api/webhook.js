import { endpoint } from '../server/runtime.mjs';
// Important for runtimes that support an explicit body-parser opt-out.
// The handler always reads the untouched request stream, never req.body.
export const config = { api: { bodyParser: false } };
export default endpoint('webhook');
