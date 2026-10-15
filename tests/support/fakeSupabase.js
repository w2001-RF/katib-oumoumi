// A small stand-in for supabase-js used by the tests: every query is recorded
// as { table, ops: [[method, ...args]] } and answered by `client.handler(call)`,
// which returns { data, error, count? }.
//
// tests/deno.json maps the web app's CDN import of supabase-js to this file,
// so js/supabaseClient.js gets the shared fake from createClient().

const QUERY_METHODS = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'in', 'or', 'gte', 'ilike', 'order', 'limit', 'single'];
const WRITE_METHODS = ['insert', 'update', 'upsert', 'delete'];

/** The kind of a recorded query: 'insert' | 'update' | 'upsert' | 'delete' | 'select' | 'rpc'. */
export function kind(call) {
  if (call.rpc) return 'rpc';
  return call.ops.map(([m]) => m).find((m) => WRITE_METHODS.includes(m)) ?? 'select';
}

/** Arguments of the first `method` call in a recorded query. */
export function argsOf(call, method) {
  return call.ops.find(([m]) => m === method)?.slice(1);
}

export function createFakeClient(handler = () => ({ data: [], error: null })) {
  const client = {
    calls: [],
    handler,
    from(table) {
      const call = { table, ops: [] };
      const builder = {};
      for (const m of QUERY_METHODS) {
        builder[m] = (...args) => {
          call.ops.push([m, ...args]);
          return builder;
        };
      }
      builder.then = (resolve, reject) => {
        client.calls.push(call);
        return Promise.resolve()
          .then(() => client.handler(call))
          .then(resolve, reject);
      };
      return builder;
    },
    rpc(fn, args) {
      const call = { table: null, rpc: fn, args, ops: [] };
      client.calls.push(call);
      return Promise.resolve(client.handler(call));
    },
    auth: {
      signInWithPassword: (creds) => Promise.resolve(client.handler({ auth: 'signIn', creds, ops: [] })),
      signOut: () => Promise.resolve(client.handler({ auth: 'signOut', ops: [] })),
      getSession: () => Promise.resolve(client.handler({ auth: 'getSession', ops: [] })),
      onAuthStateChange: (cb) => {
        client.authCallback = cb;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    reset(next = () => ({ data: [], error: null })) {
      client.calls = [];
      client.handler = next;
    },
  };
  return client;
}

/** The single client handed to the web app (see tests/deno.json). */
export const sharedClient = createFakeClient();

export function createClient() {
  return sharedClient;
}
