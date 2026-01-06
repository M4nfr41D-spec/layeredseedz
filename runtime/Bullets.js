// Copyright (c) Manfred Foissner. All rights reserved.
// License: See LICENSE.txt in the project root.

// ============================================================
// BULLETS.js - Projectile System
// ============================================================

import { State } from './State.js';
import { Enemies } from './Enemies.js';
import { Player } from './Player.js';
import { SeededRandom } from './world/SeededRandom.js';
import { seedFromParts } from './world/SeedUtil.js';
import { seedFromParts } from './world/SeedUtil.js';

export const Bullets = {
  // Spawn a new bullet
  spawn(config) {
    State.bullets.push({
      x: config.x,
      y: config.y,
      vx: config.vx || 0,
      vy: config.vy || -500,
      damage: config.damage || 10,
      size: config.size || 4,
      pierce: config.piercing || 0,
      hits: 0,
      isCrit: config.crit || false,
      isPlayer: config.isPlayer !== false
    });
  },
  
  // Spawn enemy bullet
  spawnEnemy(config) {
    State.enemyBullets.push({
      x: config.x,
      y: config.y,
      vx: config.vx || 0,
      vy: config.vy || 200,
      damage: config.damage || 10,
      size: config.size || 6
    });
  },
  
  // Update all bullets
  update(dt, canvas) {
    // Player bullets
    for (let i = State.bullets.length - 1; i >= 0; i--) {
      const b = State.bullets[i];
      
      b.x += b.vx * dt;
      b.y += b.vy * dt;      // Off screen (world mode uses zone bounds)
      const zone = State.world?.currentZone;
      if (zone) {
        const margin = 200;
        if (b.y < -margin || b.y > zone.height + margin || b.x < -margin || b.x > zone.width + margin) {
          State.bullets.splice(i, 1);
          continue;
        }
      } else {
        if (b.y < -20 || b.y > canvas.height + 20 || b.x < -20 || b.x > canvas.width + 20) {
          State.bullets.splice(i, 1);
          continue;
        }
      }
      // Check collision with enemies
      for (const e of State.enemies) {
        if (e.dead) continue;
        
        const dist = Math.hypot(b.x - e.x, b.y - e.y);
        if (dist < b.size + e.size) {
          // Hit!
          const killData = Enemies.damage(e, b.damage, b.isCrit);
          
          // Spawn damage number
          this.spawnDamageNumber(b.x, b.y, b.damage, b.isCrit);
          
          // Handle kill rewards
          if (killData) {
            this.onEnemyKilled(killData);
          }
          
          b.hits++;
          if (b.hits > b.pierce) {
            State.bullets.splice(i, 1);
          }
          break;
        }
      }
    }
    
    // Enemy bullets
    for (let i = State.enemyBullets.length - 1; i >= 0; i--) {
      const b = State.enemyBullets[i];
      
      b.x += b.vx * dt;
      b.y += b.vy * dt;      // Off screen (world mode uses zone bounds)
      const zone = State.world?.currentZone;
      if (zone) {
        const margin = 200;
        if (b.y < -margin || b.y > zone.height + margin || b.x < -margin || b.x > zone.width + margin) {
          State.enemyBullets.splice(i, 1);
          continue;
        }
      } else {
        if (b.y < -20 || b.y > canvas.height + 20 || b.x < -20 || b.x > canvas.width + 20) {
          State.enemyBullets.splice(i, 1);
          continue;
        }
      }
      // Check collision with player
      const p = State.player;
      const dist = Math.hypot(b.x - p.x, b.y - p.y);
      if (dist < b.size + 15) {
        Player.takeDamage(b.damage);
        State.enemyBullets.splice(i, 1);
      }
    }
  },
  
  // Spawn floating damage number
  spawnDamageNumber(x, y, damage, isCrit) {
    const cfg = State.data.config?.effects?.damageNumbers || {};
    
    // Config values with Diablo-style defaults
    const baseSize = cfg.baseSize || 16;
    const critSize = cfg.critSize || 28;
    const normalColor = cfg.normalColor || '#ffffff';
    const critColor = cfg.critColor || '#ffcc00';
    const bigHitColor = cfg.bigHitColor || '#ff6600';
    const floatSpeed = cfg.floatSpeed || 120;
    const duration = cfg.duration || 0.9;
    const spread = cfg.spread || 30;
    
    // Big hit threshold (relative to player damage)
    const bigHitThreshold = State.player.damage * 3;
    const isBigHit = damage >= bigHitThreshold;
    
    let color = normalColor;
    let size = baseSize;
    
    if (isCrit) {
      color = critColor;
      size = critSize;
    }
    if (isBigHit) {
      color = bigHitColor;
      size = critSize + 4;
    }
    
    State.particles.push({
      x: x + (Math.random() - 0.5) * spread,
      y: y,
      vx: (Math.random() - 0.5) * 50,
      vy: -floatSpeed,
      life: duration,
      maxLife: duration,
      text: Math.round(damage).toString(),
      isText: true,
      color: color,
      size: size,
      isCrit: isCrit,
      scale: isCrit ? 1.5 : 1.0  // For punch animation
    });
  },
  
  // Handle enemy kill rewards
  onEnemyKilled(killData) {
    const cfg = State.data.config;
    
    // XP
    import('./Leveling.js').then(module => {
      module.Leveling.addXP(killData.xp);
    });
    
    // Cells
    const baseCells = cfg?.economy?.cellsPerKill || 3;
    let cells = baseCells;
    if (killData.isElite) cells *= 3;
    if (killData.isBoss) cells *= 10;
    State.run.cells += Math.floor(cells);
    
    // Scrap
    const baseScrap = cfg?.economy?.scrapPerKill || 5;
    let scrap = baseScrap;
    if (killData.isElite) scrap *= (cfg?.economy?.eliteScrapMult || 3);
    if (killData.isBoss) scrap *= (cfg?.economy?.bossScrapMult || 10);
    State.run.scrapEarned += Math.floor(scrap);
    
    // Loot drop check
    this.checkLootDrop(killData);
  },
  
  // Check for item drop (deterministic per run where possible)
    // Get deterministic loot RNG stream for this run
  getLootRng() {
    if (State.run?.rng?.loot) return State.run.rng.loot;
    // Fallback (should rarely be used)
    const s = seedFromParts(State.meta.worldSeed || 0, 'LOOT_FALLBACK');
    return new SeededRandom(s);
  },

  // Pick rarity using config bias tables (few, but meaningful)
  pickRarityForDrop(killData, depth, rng) {
    const bias = State.data.config?.loot?.rarityBias || null;

    // Default weights if config missing
    const defaults = {
      normal: { common: 1.0, uncommon: 0.9, rare: 0.55, epic: 0.20, legendary: 0.06, mythic: 0.01 },
      elite:  { common: 0.6, uncommon: 0.9, rare: 1.2, epic: 0.7,  legendary: 0.18, mythic: 0.03 },
      boss:   { common: 0.25, uncommon: 0.6, rare: 1.1, epic: 0.9,  legendary: 0.65, mythic: 0.15 }
    };

    const tierKey = killData.isBoss ? 'boss' : (killData.isElite ? 'elite' : 'normal');
    const weights = (bias && bias[tierKey]) ? bias[tierKey] : defaults[tierKey];

    // Slight depth tilt: at very high depths, shift a bit toward higher rarity (bounded)
    const d = Math.max(1, depth || 1);
    const tilt = Math.min(0.25, Math.max(0, (d - 50) / 400)); // starts after depth 50

    const w = { ...weights };
    if (tilt > 0) {
      // Reduce common/uncommon slightly, increase legendary/mythic slightly
      w.common = (w.common ?? 0) * (1 - 0.6 * tilt);
      w.uncommon = (w.uncommon ?? 0) * (1 - 0.4 * tilt);
      w.legendary = (w.legendary ?? 0) * (1 + 0.8 * tilt);
      w.mythic = (w.mythic ?? 0) * (1 + 1.2 * tilt);
    }

    // Weighted pick
    const entries = Object.entries(w).filter(([,v]) => typeof v === 'number' && v > 0);
    let total = 0;
    for (const [,v] of entries) total += v;
    if (total <= 0) return null;

    let r = (rng.next ? rng.next() : Math.random()) * total;
    for (const [k,v] of entries) {
      r -= v;
      if (r <= 0) return k;
    }
    return entries[entries.length - 1][0];
  },

  // Check for item drop
  checkLootDrop(killData) {
    const cfg = State.data.config?.loot;
    if (!cfg) return;

    const depth = State.world?.currentZone?.depth || 1;
    const rng = this.getLootRng();

    let dropChance = cfg.baseDropChance ?? 0.02;
    if (killData.isElite) dropChance = cfg.eliteDropChance ?? 0.18;
    if (killData.isBoss) dropChance = cfg.bossDropChance ?? 0.85;

    // Apply luck (small effect)
    dropChance *= (1 + (State.player.luck || 0) * 0.02);

    if (rng.chance(dropChance)) {
      const itemSeed = seedFromParts(State.run?.seed || (State.meta.worldSeed || 0), 'ITEM', (State.run.lootSerial++), (killData.x|0), (killData.y|0), depth);
      const rarity = this.pickRarityForDrop(killData, depth, rng);

      State.pickups.push({
        type: 'item',
        x: killData.x,
        y: killData.y,
        vx: (rng.next() - 0.5) * 50,
        vy: -50 + rng.next() * 30,
        life: 10,
        rarity: rarity,
        itemSeed: (itemSeed >>> 0)
      });
    }

    // Currency drops: keep as-is for now, but make motion deterministic to avoid RNG drift
    State.pickups.push({
      type: 'cells',
      x: killData.x + (rng.next() - 0.5) * 20,
      y: killData.y,
      vx: (rng.next() - 0.5) * 40,
      vy: -30 + rng.next() * 20,
      value: killData.isBoss ? 50 : (killData.isElite ? 20 : 5),
      life: 8
    });

    // Chance for scrap
    const scrapChance = cfg.scrapDropChance ?? 0.12;
    if (rng.chance(scrapChance)) {
      State.pickups.push({
        type: 'scrap',
        x: killData.x + (rng.next() - 0.5) * 20,
        y: killData.y,
        vx: (rng.next() - 0.5) * 40,
        vy: -30 + rng.next() * 20,
        value: killData.isBoss ? 10 : (killData.isElite ? 5 : 1),
        life: 8
      });
    }
  },
  
  // Draw all bullets
  draw(ctx) {
    // Player bullets
    ctx.fillStyle = '#00ffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 10;
    
    for (const b of State.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
      ctx.fill();
      
      // Trail
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = b.size * 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    
    ctx.shadowBlur = 0;
    
    // Enemy bullets
    ctx.fillStyle = '#ff4444';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 8;
    
    for (const b of State.enemyBullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.shadowBlur = 0;
  }
};

export default Bullets;
