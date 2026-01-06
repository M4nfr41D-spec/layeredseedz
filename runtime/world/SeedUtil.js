// Copyright (c) Manfred Foissner. All rights reserved.
// License: See LICENSE.txt in the project root.

// ============================================================
// SeedUtil.js - Versioned seed mixing helpers
// ============================================================
// Provides deterministic 32-bit seeds from mixed numeric/string parts.
// Designed for: worldSeed -> runSeed -> zoneSeed -> streams (mods/loot/etc.)

import { SeededRandom } from './SeededRandom.js';

// Mix function (Murmur-ish finalizer)
export function mixSeed(seed, value) {
  let x = (seed ^ (value >>> 0)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x >>> 0;
}

// Convert any part to uint32
function partToU32(part) {
  if (typeof part === 'number') return (part >>> 0);
  if (typeof part === 'string') return SeededRandom.fromString(part);
  if (typeof part === 'boolean') return part ? 1 : 0;
  if (part == null) return 0;
  return SeededRandom.fromString(String(part));
}

// Seed from multiple parts (order matters)
export function seedFromParts(...parts) {
  let s = 0xA5A5A5A5 >>> 0;
  for (const p of parts) {
    s = mixSeed(s, partToU32(p));
  }
  return s >>> 0;
}

// Generate a random uint32 for first-time worldSeed
export function randomSeed() {
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return (a[0] >>> 0);
    }
  } catch (_) {}
  // Fallback (not cryptographically strong, but acceptable for local prototype)
  return SeededRandom.fromString(String(Date.now()) + '_' + String(Math.random()));
}
