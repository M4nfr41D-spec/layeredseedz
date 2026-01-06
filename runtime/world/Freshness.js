// Copyright (c) Manfred Foissner. All rights reserved.
// License: See LICENSE.txt in the project root.

// ============================================================
// Freshness.js - Anti-Repetition Memory for Endless Generation
// ============================================================
// Goal: Worlds feel non-repeating to players, while remaining fully
// deterministic and debuggable.
//
// This module stores a ring buffer of recently seen "keys" (typically
// a macro signature such as biome|layout|backdrop). When choosing among
// candidates, we down-weight options that occurred recently.

export const Freshness = {
  // Ensure State.meta.freshness exists and is sane.
  ensure(meta, cfg = {}) {
    if (!meta.freshness || typeof meta.freshness !== 'object') {
      meta.freshness = { window: 8, recent: [] };
    }
    const window = (cfg.window ?? meta.freshness.window ?? 8);
    meta.freshness.window = Math.max(1, Math.min(64, window | 0));
    if (!Array.isArray(meta.freshness.recent)) meta.freshness.recent = [];
    // Truncate if too long
    if (meta.freshness.recent.length > meta.freshness.window) {
      meta.freshness.recent = meta.freshness.recent.slice(-meta.freshness.window);
    }
    return meta.freshness;
  },

  count(meta, key) {
    const f = meta?.freshness;
    if (!f || !Array.isArray(f.recent)) return 0;
    let c = 0;
    for (const k of f.recent) if (k === key) c++;
    return c;
  },

  // Multiply weight by penaltyBase^countRecent.
  applyPenalty(weight, countRecent, penaltyBase) {
    const base = (typeof penaltyBase === 'number' && penaltyBase > 0 && penaltyBase < 1)
      ? penaltyBase
      : 0.25;
    return weight * Math.pow(base, Math.max(0, countRecent | 0));
  },

  push(meta, key) {
    const f = this.ensure(meta);
    f.recent.push(key);
    if (f.recent.length > f.window) {
      f.recent.splice(0, f.recent.length - f.window);
    }
  },

  // Pick one option from [{id, weight, ...}] using rng (SeededRandom) with
  // anti-repeat penalty based on keyFn(option).
  pick(rng, options, keyFn, meta, penaltyBase) {
    if (!options || options.length === 0) return null;

    const weights = []
    let total = 0;
    for (const opt of options) {
      const w0 = (typeof opt.weight === 'number' ? opt.weight : 1);
      const key = keyFn ? keyFn(opt) : opt.id;
      const c = this.count(meta, key);
      const w = this.applyPenalty(Math.max(0, w0), c, penaltyBase);
      weights.push({ opt, key, w });
      total += w;
    }

    // If all weights go to 0, fallback to unpenalized.
    if (total <= 0) {
      total = 0;
      weights.length = 0;
      for (const opt of options) {
        const key = keyFn ? keyFn(opt) : opt.id;
        const w = Math.max(0, (typeof opt.weight === 'number' ? opt.weight : 1));
        weights.push({ opt, key, w });
        total += w;
      }
      if (total <= 0) {
        const fallback = options[0];
        return { selected: fallback, key: keyFn ? keyFn(fallback) : fallback.id };
      }
    }

    const r = rng.range(0, total);
    let acc = 0;
    for (const row of weights) {
      acc += row.w;
      if (r <= acc) {
        return { selected: row.opt, key: row.key };
      }
    }

    // Shouldn't happen due to numeric issues; fallback last.
    const last = weights[weights.length - 1];
    return { selected: last.opt, key: last.key };
  }
};

export default Freshness;
