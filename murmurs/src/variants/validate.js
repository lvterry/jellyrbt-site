import { PARAM_KEYS, PARAM_SCHEMA, defaultParams } from './paramSchema.js';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Copy only schema keys, in schema order, with primitive values. */
export function cloneParams(params) {
  const copy = {};
  for (const key of PARAM_KEYS) copy[key] = params[key];
  return copy;
}

function numericValue(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

/**
 * Validate and clamp a params object against PARAM_SCHEMA.
 *
 * - Unknown keys are dropped.
 * - Numeric values are clamped to min/max (ints rounded).
 * - Valid enum values are required; an invalid/missing enum rejects the object.
 * - A missing or malformed color falls back to the default.
 * - In-range valid numbers are returned unchanged, so saving and reloading a
 *   preset is lossless; clamping only ever touches values that need it.
 */
export function validateParams(input) {
  const errors = [];
  const clamped = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      params: defaultParams(),
      errors: ['Params must be an object.'],
      clamped,
    };
  }

  const params = {};
  for (const key of PARAM_KEYS) {
    const spec = PARAM_SCHEMA[key];
    const value = input[key];

    if (spec.type === 'enum') {
      if (spec.values.includes(value)) {
        params[key] = value;
      } else {
        errors.push(
          value === undefined
            ? `Missing required value for "${key}".`
            : `Invalid ${key} "${String(value)}".`,
        );
      }
      continue;
    }

    if (spec.type === 'color') {
      if (typeof value === 'string' && HEX_COLOR.test(value)) {
        params[key] = value;
      } else {
        params[key] = spec.default;
        clamped.push(key);
      }
      continue;
    }

    const n = numericValue(value);
    if (!Number.isFinite(n)) {
      params[key] = spec.default;
      clamped.push(key);
      continue;
    }

    let next = Math.min(spec.max, Math.max(spec.min, n));
    if (spec.type === 'int') next = Math.round(next);
    if (next !== n) clamped.push(key);
    params[key] = next;
  }

  return { ok: errors.length === 0, params, errors, clamped };
}