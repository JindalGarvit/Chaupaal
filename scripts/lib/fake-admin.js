/**
 * In-memory Firebase Admin stand-in for server-lib tests (Global L8 export / deletion / consent).
 * Firestore: docs by path, set/merge/update (dotted paths), FieldValue sentinels, where (== / in /
 * array-contains), collectionGroup, limit, batch, runTransaction, recursiveDelete, listCollections.
 * Auth, RTDB and Storage keep just enough to assert what was called. `log` records the order of
 * destructive operations.
 */
'use strict';

function isPlain(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && !Buffer.isBuffer(v) && !(v instanceof Date) && !v.__fv;
}
function clone(v) {
  if (v == null) return v;
  if (Buffer.isBuffer(v)) return Buffer.from(v);
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.map(clone);
  if (typeof v === 'object') {
    const o = {};
    Object.keys(v).forEach((k) => (o[k] = clone(v[k])));
    return o;
  }
  return v;
}

const FieldValue = {
  serverTimestamp: () => ({ __fv: 'ts' }),
  delete: () => ({ __fv: 'del' }),
  increment: (n) => ({ __fv: 'inc', n }),
  arrayUnion: (...a) => ({ __fv: 'union', a }),
  arrayRemove: (...a) => ({ __fv: 'remove', a }),
};

function resolve(cur, val) {
  if (!val || !val.__fv) return clone(val);
  if (val.__fv === 'ts') return new Date();
  if (val.__fv === 'inc') return (Number(cur) || 0) + val.n;
  if (val.__fv === 'union') return [...new Set([...(Array.isArray(cur) ? cur : []), ...val.a])];
  if (val.__fv === 'remove') return (Array.isArray(cur) ? cur : []).filter((x) => val.a.indexOf(x) < 0);
  return undefined;
}

function mergeInto(target, data) {
  Object.keys(data).forEach((k) => {
    const v = data[k];
    if (v && v.__fv === 'del') delete target[k];
    else if (isPlain(v) && isPlain(target[k])) mergeInto(target[k], v);
    else if (isPlain(v)) {
      target[k] = {};
      mergeInto(target[k], v);
    } else target[k] = resolve(target[k], v);
  });
  return target;
}

function getField(obj, field) {
  return String(field)
    .split('.')
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function createFakeAdmin(opts) {
  const o = opts || {};
  const docs = new Map();
  const log = [];
  let auto = 0;

  function snap(path) {
    const data = docs.get(path);
    return { exists: data !== undefined, id: path.split('/').pop(), ref: docRef(path), data: () => (data === undefined ? undefined : clone(data)) };
  }

  function docRef(path) {
    const parts = path.split('/');
    return {
      id: parts[parts.length - 1],
      path,
      get parent() {
        return collRef(parts.slice(0, -1).join('/'));
      },
      collection: (name) => collRef(path + '/' + name),
      get: async () => snap(path),
      set: async (data, so) => {
        const cur = docs.get(path);
        if (so && so.merge && cur) docs.set(path, mergeInto(clone(cur), data));
        else docs.set(path, mergeInto({}, data));
      },
      update: async (patch) => {
        const cur = docs.get(path);
        if (cur === undefined) throw Object.assign(new Error('NOT_FOUND ' + path), { code: 5 });
        const next = clone(cur);
        Object.keys(patch).forEach((k) => {
          const keys = k.split('.');
          let t = next;
          keys.slice(0, -1).forEach((kk) => {
            if (!isPlain(t[kk])) t[kk] = {};
            t = t[kk];
          });
          const last = keys[keys.length - 1];
          const v = patch[k];
          if (v && v.__fv === 'del') delete t[last];
          else t[last] = resolve(t[last], v);
        });
        docs.set(path, next);
      },
      delete: async () => {
        log.push('delete ' + path);
        docs.delete(path);
      },
      listCollections: async () => {
        const names = new Set();
        const pre = path + '/';
        for (const p of docs.keys()) if (p.startsWith(pre)) names.add(p.slice(pre.length).split('/')[0]);
        return [...names].map((n) => collRef(path + '/' + n));
      },
    };
  }

  function query(base, group) {
    const q = { filters: [], lim: Infinity };
    const api = {
      where: (field, op, value) => {
        q.filters.push([field, op, value]);
        return api;
      },
      orderBy: () => api,
      startAfter: () => api,
      limit: (n) => {
        q.lim = n;
        return api;
      },
      get: async () => {
        const out = [];
        for (const [p, data] of docs) {
          const parts = p.split('/');
          const parent = parts.slice(0, -1).join('/');
          const inScope = group ? parts.length >= 2 && parts[parts.length - 2] === group : parent === base;
          if (!inScope) continue;
          const ok = q.filters.every(([f, op, v]) => {
            const x = getField(data, f);
            if (op === '==') return x === v;
            if (op === 'in') return Array.isArray(v) && v.indexOf(x) >= 0;
            if (op === 'array-contains') return Array.isArray(x) && x.indexOf(v) >= 0;
            return false;
          });
          if (ok) out.push(snap(p));
          if (out.length >= q.lim) break;
        }
        return { docs: out, size: out.length, empty: !out.length };
      },
    };
    return api;
  }

  function collRef(path) {
    const parts = path.split('/');
    const base = query(path, null);
    return Object.assign(base, {
      id: parts[parts.length - 1],
      path,
      get parent() {
        return parts.length > 1 ? docRef(parts.slice(0, -1).join('/')) : null;
      },
      doc: (id) => docRef(path + '/' + (id || 'auto' + ++auto)),
      add: async (data) => {
        const r = docRef(path + '/auto' + ++auto);
        await r.set(data);
        return r;
      },
    });
  }

  const db = {
    collection: (name) => collRef(name),
    collectionGroup: (name) => query(null, name),
    batch: () => {
      const ops = [];
      return {
        set: (r, d, so) => ops.push(() => r.set(d, so)),
        update: (r, d) => ops.push(() => r.update(d)),
        delete: (r) => ops.push(() => r.delete()),
        commit: async () => {
          for (const op of ops) await op();
        },
      };
    },
    runTransaction: async (fn) =>
      fn({
        get: (r) => r.get(),
        set: (r, d, so) => r.set(d, so),
        update: (r, d) => r.update(d),
        delete: (r) => r.delete(),
      }),
    recursiveDelete: async (ref) => {
      const p = ref.path;
      log.push('recursiveDelete ' + p);
      for (const k of [...docs.keys()]) if (k === p || k.startsWith(p + '/')) docs.delete(k);
    },
  };

  const users = new Map(Object.entries(o.authUsers || {}));
  const auth = {
    revoked: [],
    deleted: [],
    getUserByEmail: async (email) => {
      for (const [uid, u] of users) if (u.email === email) return { uid, ...u };
      throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
    },
    revokeRefreshTokens: async (uid) => {
      auth.revoked.push(uid);
    },
    deleteUser: async (uid) => {
      log.push('auth.deleteUser ' + uid);
      auth.deleted.push(uid);
      users.delete(uid);
    },
  };

  const rtdb = {
    removed: [],
    ref: (p) => ({
      remove: async () => {
        log.push('rtdb.remove ' + p);
        rtdb.removed.push(p);
      },
    }),
  };

  const files = new Map();
  const storage = {
    files,
    bucket: (name) => ({
      name,
      file: (p) => ({
        save: async (buf) => files.set(p, Buffer.from(buf)),
        delete: async () => files.delete(p),
        getSignedUrl: async (so) => [`https://storage.fake/${name}/${p}?expires=${so.expires}`],
      }),
      deleteFiles: async ({ prefix }) => {
        log.push('storage.deleteFiles ' + prefix);
        for (const k of [...files.keys()]) if (k.startsWith(prefix)) files.delete(k);
      },
    }),
  };

  const admin = {
    firestore: Object.assign(() => db, { FieldValue }),
    auth: () => auth,
    database: () => rtdb,
    log,
    docs,
    db,
    authApi: auth,
    rtdb,
  };
  if (o.storage) admin.storage = () => storage;
  admin.storageApi = storage;
  return admin;
}

module.exports = { createFakeAdmin, FieldValue };
