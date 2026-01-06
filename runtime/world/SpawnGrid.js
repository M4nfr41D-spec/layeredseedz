// Copyright (c) Manfred Foissner. All rights reserved.
// License: See LICENSE.txt in the project root.

// ============================================================
// SpawnGrid.js - Spatial hash for spawn proximity queries
// ============================================================
// Stores spawn objects in a grid for fast nearby queries.

export class SpawnGrid {
  constructor(cellSize = 500) {
    this.cellSize = Math.max(64, cellSize | 0);
    this.cells = new Map(); // key -> spawn[]
  }

  _key(cx, cy) { return (cx << 16) ^ (cy & 0xFFFF); }

  _cellCoord(x, y) {
    return {
      cx: Math.floor(x / this.cellSize),
      cy: Math.floor(y / this.cellSize)
    };
  }

  clear() { this.cells.clear(); }

  build(spawns) {
    this.clear();
    if (!spawns || !spawns.length) return;
    for (const s of spawns) {
      if (!s) continue;
      this.insert(s);
    }
  }

  insert(spawn) {
    const { cx, cy } = this._cellCoord(spawn.x, spawn.y);
    const k = this._key(cx, cy);
    let arr = this.cells.get(k);
    if (!arr) { arr = []; this.cells.set(k, arr); }
    arr.push(spawn);
  }

  // Query spawns in cells overlapping the circle (x,y,r)
  query(x, y, r) {
    const out = [];
    const minX = x - r, maxX = x + r;
    const minY = y - r, maxY = y + r;
    const c0 = this._cellCoord(minX, minY);
    const c1 = this._cellCoord(maxX, maxY);

    for (let cx = c0.cx; cx <= c1.cx; cx++) {
      for (let cy = c0.cy; cy <= c1.cy; cy++) {
        const k = this._key(cx, cy);
        const arr = this.cells.get(k);
        if (arr && arr.length) out.push(...arr);
      }
    }
    return out;
  }
}

export default SpawnGrid;
