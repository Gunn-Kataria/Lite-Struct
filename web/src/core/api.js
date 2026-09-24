import { createLogger } from './logger';

const log = createLogger('api');

// Runtime configuration. The standalone app uses the defaults (VITE_API_URL or http://localhost:4000);
// a host application calls configure({ apiUrl, getAuthToken, user, headers }) once at startup.
let config = {
  apiUrl: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || 'http://localhost:4000',
  getAuthToken: null, // () => string | Promise<string>  -> sent as "Authorization: Bearer <token>"
  user: null, // string -> sent as "X-Tstruct-User" (becomes createdBy / modifiedBy on the server)
  headers: {}, // extra headers for every API call
};

export function configure(next = {}) {
  config = { ...config, ...next, headers: { ...config.headers, ...(next.headers || {}) } };
  return config;
}
export const getConfig = () => config;

const enc = encodeURIComponent;

async function request(method, path, body) {
  const url = `${config.apiUrl.replace(/\/$/, '')}${path}`;
  log.info(`-> ${method} ${url}`, body);
  const started = Date.now();

  const headers = { ...config.headers };
  if (body) headers['Content-Type'] = 'application/json';
  if (config.user) headers['X-Tstruct-User'] = config.user;
  if (config.getAuthToken) {
    const token = await config.getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    log.error(`xx ${method} ${url} network error`, { message: e.message });
    throw new Error(`Cannot reach server at ${config.apiUrl}. Is it running?`);
  }
  const json = await res.json().catch(() => ({}));
  const ms = Date.now() - started;
  if (!res.ok) {
    log.error(`xx ${method} ${url} ${res.status} (${ms}ms)`, json);
    const err = new Error(json.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = json.errors;
    throw err;
  }
  log.info(`<- ${method} ${url} ${res.status} (${ms}ms)`, json);
  return json;
}

// Anywhere a struct is referenced, `structRef` may be its id (uuid) or its stable key (e.g. "leave-request").
export const listStructs = () => request('GET', '/api/structs').then((r) => r.structs);
export const getStruct = (structRef) => request('GET', `/api/structs/${enc(structRef)}`).then((r) => r.struct);
export const createStruct = (payload) => request('POST', '/api/structs', payload);
export const updateStruct = (structRef, payload) => request('PUT', `/api/structs/${enc(structRef)}`, payload);

// opts.ref: only records linked to that host reference
export const listRecords = (structRef, opts = {}) =>
  request('GET', `/api/structs/${enc(structRef)}/records${opts.ref ? `?ref=${enc(opts.ref)}` : ''}`).then((r) => r.records);
export const getRecord = (structRef, recordId) => request('GET', `/api/structs/${enc(structRef)}/records/${enc(recordId)}`).then((r) => r.record);
// extra: { ref, meta } - optional host linking fields
export const createRecord = (structRef, data, extra = {}) => request('POST', `/api/structs/${enc(structRef)}/records`, { data, ...extra });
export const updateRecord = (structRef, recordId, data, extra = {}) =>
  request('PUT', `/api/structs/${enc(structRef)}/records/${enc(recordId)}`, { data, ...extra });

// Runtime fetch for `selection` fields. Accepts an array (or {items|data|results: []}) of strings or objects.
export async function fetchSelectionItems(apiUrl) {
  log.info(`-> GET (selection) ${apiUrl}`);
  try {
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const arr = Array.isArray(json) ? json : json.items || json.data || json.results || [];
    const items = arr.map((it) =>
      typeof it === 'object' && it !== null
        ? {
            value: String(it.id ?? it.value ?? it.name ?? it.label ?? it.title),
            label: String(it.label ?? it.name ?? it.title ?? it.id ?? it.value),
            raw: it,
          }
        : { value: String(it), label: String(it), raw: it }
    );
    log.info(`<- (selection) ${apiUrl}: ${items.length} items`);
    return items;
  } catch (e) {
    log.error(`xx (selection) ${apiUrl}`, { message: e.message });
    throw e;
  }
}
