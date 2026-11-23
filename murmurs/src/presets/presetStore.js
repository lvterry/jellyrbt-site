import { validateParams } from '../variants/validate.js';

export const STORAGE_KEY = 'murmuration.presets.v1';
export const EXPORT_FORMAT = 'murmuration.presets';
export const EXPORT_VERSION = 1;

// Falls back to memory if storage is unavailable (private mode, blocked
// storage, Safari edge cases). The app keeps working for the session.
let memoryFallback = [];

function readStored() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw == null) return memoryFallback.slice();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return memoryFallback.slice();
  }
}

function writeStored(presets) {
  memoryFallback = presets.slice();
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Keep the in-memory copy; export still works.
  }
}

function newId() {
  if (globalThis.crypto?.randomUUID) return `p-${globalThis.crypto.randomUUID()}`;
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanName(value, fallback = 'Untitled preset') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return fallback;
  return trimmed.slice(0, 80);
}

function cleanDate(value) {
  if (typeof value === 'string') {
    const time = Date.parse(value);
    if (Number.isFinite(time)) return new Date(time).toISOString();
  }
  return new Date().toISOString();
}

function clonePreset(preset) {
  return { ...preset, params: { ...preset.params } };
}

/** Returns a normalised preset, or null with an error message. */
export function sanitisePreset(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { ok: false, error: 'Preset is not an object.' };
  }

  const validation = validateParams(entry.params);
  if (!validation.ok) {
    return { ok: false, error: validation.errors.join(' ') };
  }

  return {
    ok: true,
    preset: {
      id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim().slice(0, 120) : newId(),
      name: cleanName(entry.name),
      createdAt: cleanDate(entry.createdAt),
      baseVariantId:
        typeof entry.baseVariantId === 'string' && entry.baseVariantId.trim()
          ? entry.baseVariantId.trim().slice(0, 120)
          : null,
      params: validation.params,
    },
  };
}

export function listPresets() {
  const raw = readStored();
  const presets = [];
  for (const entry of raw) {
    const result = sanitisePreset(entry);
    if (result.ok) presets.push(result.preset);
  }
  return presets;
}

/** Snapshot the full params object. Never stores a delta. */
export function savePreset(variantId, name, params) {
  const validation = validateParams(params);
  if (!validation.ok) {
    throw new Error(`Cannot save invalid preset: ${validation.errors.join(' ')}`);
  }

  const preset = {
    id: newId(),
    name: cleanName(name),
    createdAt: new Date().toISOString(),
    baseVariantId: variantId ?? null,
    params: validation.params,
  };

  const presets = listPresets();
  presets.push(preset);
  writeStored(presets);
  return clonePreset(preset);
}

export function loadPreset(presetId) {
  const preset = listPresets().find((entry) => entry.id === presetId);
  return preset ? clonePreset(preset) : null;
}

export function deletePreset(presetId) {
  const presets = listPresets();
  const next = presets.filter((entry) => entry.id !== presetId);
  if (next.length === presets.length) return false;
  writeStored(next);
  return true;
}

export function renamePreset(presetId, name) {
  const presets = listPresets();
  const preset = presets.find((entry) => entry.id === presetId);
  if (!preset) return null;
  preset.name = cleanName(name, preset.name);
  writeStored(presets);
  return clonePreset(preset);
}

export function exportPresets() {
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      presets: listPresets(),
    },
    null,
    2,
  );
}

/**
 * Merge presets by id (an incoming preset replaces an existing one with the
 * same id). Every param is clamped against the schema, unknown keys are
 * dropped, and entries with invalid algorithm/colorMode values are rejected.
 */
export function importPresets(data) {
  let incoming;
  if (typeof data === 'string') {
    try {
      incoming = JSON.parse(data);
    } catch {
      return { added: 0, replaced: 0, rejected: 1, errors: ['File is not valid JSON.'] };
    }
  } else {
    incoming = data;
  }

  const list =
    Array.isArray(incoming)
      ? incoming
      : incoming && typeof incoming === 'object' && Array.isArray(incoming.presets)
        ? incoming.presets
        : null;

  if (!list) {
    return { added: 0, replaced: 0, rejected: 1, errors: ['No preset array found.'] };
  }

  const existing = listPresets();
  const byId = new Map(existing.map((preset) => [preset.id, preset]));
  const errors = [];
  let added = 0;
  let replaced = 0;
  let rejected = 0;
  const seen = new Set();

  for (const entry of list) {
    const result = sanitisePreset(entry);
    if (!result.ok) {
      rejected++;
      errors.push(result.error);
      continue;
    }
    const preset = result.preset;
    // A repeated id within the same file: last one wins, counted once.
    if (!seen.has(preset.id)) {
      seen.add(preset.id);
      if (byId.has(preset.id)) replaced++;
      else added++;
    }
    byId.set(preset.id, preset);
  }

  if (added + replaced > 0) writeStored([...byId.values()]);

  return {
    added,
    replaced,
    rejected,
    errors: errors.slice(0, 6),
  };
}

/** Test-only: drop the in-memory fallback as well as the stored array. */
export function clearPresets() {
  memoryFallback = [];
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}