// Copyright (c) Manfred Foissner. All rights reserved.
// License: See LICENSE.txt in the project root.

// ============================================================
// DATALOADER.js - Loads JSON Data Files
// ============================================================
// Fetches all game data from /data/ folder and populates State.data

import { State } from './State.js';

const DATA_FILES = [
  'config',
  'rarities',
  'slots',
  'items',
  'affixes',
  'skills',
  'pilotStats',
  'runUpgrades',
  'enemies',
  'acts'
];

export async function loadAllData() {
  console.log('📦 Loading game data...');
  
  // Load main data files
  const promises = DATA_FILES.map(async (name) => {
    try {
      const response = await fetch(`./data/${name}.json`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      State.data[name] = data;
      console.log(`  ✓ ${name}.json loaded`);
      return { name, success: true };
    } catch (error) {
      console.error(`  ✗ ${name}.json failed:`, error.message);
      return { name, success: false, error };
    }
  });
  
  const results = await Promise.all(promises);
  
  const failed = results.filter(r => !r.success);
  
  if (failed.length > 0) {
    console.warn(`⚠️ ${failed.length} data files failed to load`);
  } else {
    console.log('✅ All game data loaded successfully');
  }
  
  return failed.length === 0;
}

// Helper to get nested data safely
export function getData(path) {
  const parts = path.split('.');
  let current = State.data;
  
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  
  return current;
}

// Get config value with fallback
export function getConfig(key, fallback = null) {
  const cfg = State.data.config;
  if (!cfg) return fallback;

  // Exact key first (supports legacy flat keys)
  if (Object.prototype.hasOwnProperty.call(cfg, key)) return cfg[key];

  // Dot-path support: "progression.baseXP"
  if (typeof key === 'string' && key.includes('.')) {
    const parts = key.split('.');
    let cur = cfg;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && Object.prototype.hasOwnProperty.call(cur, p)) {
        cur = cur[p];
      } else {
        return fallback;
      }
    }
    return (cur ?? fallback);
  }

  return (cfg[key] ?? fallback);
}

// Get all items as flat array
export function getAllItems() {
  const items = State.data.items;
  if (!items) return [];
  
  const result = [];
  for (const category of Object.values(items)) {
    for (const [id, item] of Object.entries(category)) {
      result.push({ id, ...item });
    }
  }
  return result;
}

// Get item by ID
export function getItemData(itemId) {
  const items = State.data.items;
  if (!items) return null;
  
  for (const category of Object.values(items)) {
    if (itemId in category) {
      return { id: itemId, ...category[itemId] };
    }
  }
  return null;
}

// Get random affix for rarity
export function getRandomAffix(allAffixes, rng = null) {
  if (!allAffixes || allAffixes.length === 0) return null;
  // rng can be SeededRandom-like with int(min,max) or next()
  if (rng && typeof rng.int === 'function') {
    return allAffixes[rng.int(0, allAffixes.length - 1)];
  }
  if (rng && typeof rng.next === 'function') {
    const idx = Math.floor(rng.next() * allAffixes.length);
    return allAffixes[Math.max(0, Math.min(allAffixes.length - 1, idx))];
  }
  return allAffixes[Math.floor(Math.random() * allAffixes.length)];
}

export default { loadAllData, getData, getConfig, getAllItems, getItemData, getRandomAffix };
