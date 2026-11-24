const KEY = 'murmurs.v4.versions';

/** Oldest versions fall off the end; thumbnails are the bulk of the payload. */
export const LIMIT = 18;

let counter = 0;

function isVersion(value) {
  return Boolean(value)
    && typeof value === 'object'
    && typeof value.id === 'string'
    && Number.isInteger(value.slot)
    && value.slot >= 0
    && typeof value.form === 'string'
    && typeof value.seed === 'number'
    && Boolean(value.shape)
    && typeof value.shape === 'object'
    && typeof value.thumb === 'string'
    && Number.isFinite(value.savedAt);
}

function read(storage) {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isVersion).slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

/**
 * Saved shapes, newest first. A square's shape is not a dial, so DialKit's
 * preset store cannot hold it; this is the sheet's own small store. Writes are
 * allowed to fail: the list still works for the session, and `stored` says
 * whether it reached the browser.
 */
export function createVersionStore(storage) {
  let versions = read(storage);
  let stored = true;
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());

  function write() {
    if (!storage) {
      stored = false;
      return;
    }
    for (;;) {
      try {
        storage.setItem(KEY, JSON.stringify(versions));
        stored = true;
        return;
      } catch {
        if (versions.length <= 1) {
          stored = false;
          return;
        }
        versions = versions.slice(0, -1);
      }
    }
  }

  return {
    all: () => versions.slice(),
    get stored() {
      return stored;
    },
    add({ slot, form, shape, seed, thumb }) {
      const version = {
        id: `${Date.now().toString(36)}-${(counter++).toString(36)}`,
        savedAt: Date.now(),
        slot,
        form,
        shape: { ...shape },
        seed,
        thumb,
      };
      versions = [version, ...versions].slice(0, LIMIT);
      write();
      notify();
      return version;
    },
    remove(id) {
      const next = versions.filter((version) => version.id !== id);
      if (next.length === versions.length) return false;
      versions = next;
      write();
      notify();
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
