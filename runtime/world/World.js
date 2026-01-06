// Copyright (c) Manfred Foissner. All rights reserved.
// License: See LICENSE.txt in the project root.

// ============================================================
// World.js - Zone & Enemy Spawn Management
// ============================================================
// Manages current zone, spawns enemies when player approaches

import { State } from '../State.js';
import { MapGenerator } from './MapGenerator.js';
import { Camera } from './Camera.js';
import { SeededRandom } from './SeededRandom.js';
import { DepthRules } from './DepthRules.js';
import { SpawnGrid } from './SpawnGrid.js';
import { Freshness } from './Freshness.js';
import { seedFromParts } from './SeedUtil.js';

export const World = {
  currentZone: null,
  currentAct: null,
  zoneIndex: 0,
  
  // Spawning config
  spawnRadius: 600,      // Distance to trigger spawn
  despawnRadius: 1200,   // Distance to despawn (performance)
  activeEnemies: [],     // Currently active enemies from spawns
  enemyGrid: null,
  eliteGrid: null,
  rngEncounters: null,
  
  // Initialize world with act config
  async init(actId, seed = null) {
    // Load act config
    const actConfig = State.data.acts?.[actId];
    if (!actConfig) {
      console.error(`Act ${actId} not found!`);
      return false;
    }
    
    this.currentAct = actConfig;
    this.currentAct.id = actId;
    
    // Use provided seed or derive deterministically from meta/run
    const fallback = seedFromParts(State.meta.worldSeed || 0, 'ACT', actId, State.meta.runIndex || 0, State.data.config?.version ?? '0');
    const actSeed = (typeof seed === 'number') ? (seed >>> 0) : (State.run?.seed ? (State.run.seed >>> 0) : fallback);
    this.currentAct.seed = (actSeed >>> 0);
    
    // Generate first zone
    this.zoneIndex = 0;
    this.loadZone(0);
    
    return true;
  },
  
  // Load/generate a zone (endless via depth)
  loadZone(index) {
    // Depth is 1-based
    const depth = index + 1;
    const zoneSeed = MapGenerator.createZoneSeed(this.currentAct.seed, index);

    // Layered seeds (deterministic) - used to drive variety without RNG leaks
    const zoneSeeds = {
      zone: zoneSeed,
      macro: seedFromParts(zoneSeed, 'MACRO'),
      meso: seedFromParts(zoneSeed, 'MESO'),
      micro: seedFromParts(zoneSeed, 'MICRO'),
      mods: seedFromParts(zoneSeed, 'MODS'),
      encounters: seedFromParts(zoneSeed, 'ENCOUNTERS'),
      loot: seedFromParts(zoneSeed, 'LOOT')
    };

    // Hybrid milestone unlocks (deterministic per run)
    const unlockSeed = seedFromParts(this.currentAct.seed, 'UNLOCK', depth);
    DepthRules.maybeUnlock(depth, this.currentAct, new SeededRandom(unlockSeed));
    DepthRules.recordDepth(depth);

    // Boss interval: default to act.zones (number) or 4
    const bossInterval = (typeof this.currentAct.zones === 'number' && this.currentAct.zones > 0)
      ? this.currentAct.zones
      : 4;
    const isBossZone = (depth % bossInterval) === 0;

    // Sample active modifiers for this zone (deterministic per zone)
    const rngMods = new SeededRandom(zoneSeeds.mods);
    const activeMods = DepthRules.sampleActive(depth, this.currentAct, rngMods);



    // -------- Freshness (anti-repeat) + macro tags --------
    const fCfg = State.data?.config?.freshness || {};
    Freshness.ensure(State.meta, fCfg);
    const penaltyBase = (typeof fCfg.penaltyBase === 'number') ? fCfg.penaltyBase : 0.25;

    const biomeId = this.currentAct.biome || 'space';
    const rngMacro = new SeededRandom(zoneSeeds.macro);

    // Macro packs (layout x backdrop) - extendable when art arrives
    const layouts = [
      { id: 'OPEN', weight: 1.0 },
      { id: 'CLUTTERED', weight: 0.9 },
      { id: 'CORRIDOR', weight: 0.7 },
      { id: 'ARENA', weight: 0.7 },
      { id: 'CRAMPED', weight: 0.5 }
    ];
    const backdrops = [
      { id: 'A', weight: 1.0 },
      { id: 'B', weight: 0.9 },
      { id: 'C', weight: 0.8 },
      { id: 'D', weight: 0.7 }
    ];

    const macroPacks = [];
    for (const l of layouts) {
      for (const b of backdrops) {
        macroPacks.push({
          id: `${l.id}|${b.id}`,
          layout: l.id,
          backdrop: b.id,
          weight: l.weight * b.weight
        });
      }
    }

    const pick = Freshness.pick(
      rngMacro,
      macroPacks,
      (o) => `${biomeId}|${o.layout}|${o.backdrop}`,
      State.meta,
      penaltyBase
    );

    const layout = pick?.selected?.layout || 'OPEN';
    const backdrop = pick?.selected?.backdrop || 'A';
    const freshnessKey = `${biomeId}|${layout}|${backdrop}`;
    Freshness.push(State.meta, freshnessKey);

    // Build a zone signature for logging/telemetry
    const modsKey = Array.isArray(activeMods) && activeMods.length ? activeMods.slice().sort().join(',') : '-';
    const zoneSignature = `${freshnessKey}|mods:${modsKey}|boss:${isBossZone ? 1 : 0}`;
    if (isBossZone) {
      this.currentZone = MapGenerator.generateBossZone(this.currentAct, zoneSeed, { depth, mods: activeMods, seeds: zoneSeeds, layout, backdrop });
    } else {
      this.currentZone = MapGenerator.generate(this.currentAct, zoneSeed, { depth, mods: activeMods, seeds: zoneSeeds, layout, backdrop });
    }

    this.currentZone.depth = depth;
    this.currentZone.mods = activeMods;
    this.currentZone.layout = layout;
    this.currentZone.backdrop = backdrop;
    this.currentZone.signature = zoneSignature;
    this.currentZone.seeds = zoneSeeds;

    // Deterministic encounter RNG stream for this zone (patrol angles, etc.)
    this.rngEncounters = new SeededRandom(zoneSeeds.encounters);

    // Build spatial hash for fast proximity spawning
    const cellSize = Math.max(200, this.spawnRadius);
    this.enemyGrid = new SpawnGrid(cellSize);
    this.enemyGrid.build(this.currentZone.enemySpawns || []);
    this.eliteGrid = new SpawnGrid(cellSize);
    this.eliteGrid.build(this.currentZone.eliteSpawns || []);

    this.zoneIndex = index;
    this.activeEnemies = [];
    State.world.zoneIndex = index;
    State.world.seed = zoneSeed;
    State.world.seeds = zoneSeeds;
    State.world.currentZone = this.currentZone;

    // Position player at spawn
    State.player.x = this.currentZone.spawn.x;
    State.player.y = this.currentZone.spawn.y;
    State.player.vx = 0;
    State.player.vy = 0;

    // Snap camera to player (clamped to zone bounds to prevent initial camera drift)
    const canvas = document.getElementById('gameCanvas');
    const screenW = canvas?.width || 800;
    const screenH = canvas?.height || 600;
    const mapW = this.currentZone.width || 2000;
    const mapH = this.currentZone.height || 2000;

    const rawX = State.player.x - screenW / 2;
    const rawY = State.player.y - screenH / 2;
    const clampedX = Math.max(0, Math.min(mapW - screenW, rawX));
    const clampedY = Math.max(0, Math.min(mapH - screenH, rawY));

    Camera.snapTo(clampedX, clampedY);

    // Reset zone-combat counters
    this.spawnedEnemyCount = 0;
    this.spawnedEliteCount = 0;
    this.bossSpawned = false;


    const dbg = State.data?.config?.debug;
    if (dbg?.logZoneSummary) {
      console.log('[ZONE]', {
        depth, zoneIndex: index, seed: zoneSeed, layout, backdrop,
        mods: activeMods, boss: isBossZone,
        enemySpawns: this.currentZone.enemySpawns?.length || 0,
        eliteSpawns: this.currentZone.eliteSpawns?.length || 0,
        obstacles: this.currentZone.obstacles?.length || 0,
        signature: zoneSignature
      });
    }
  },
  
  // Update - handle proximity spawning
  update(dt) {
    if (!this.currentZone) return;
    
    const player = State.player;
    
    // Check enemy spawns (spatial hash)
    const enemyCandidates = (this.enemyGrid ? this.enemyGrid.query(player.x, player.y, this.spawnRadius) : this.currentZone.enemySpawns);
    for (const spawn of enemyCandidates) {
      if (spawn.killed) continue;

      const dist = Math.hypot(player.x - spawn.x, player.y - spawn.y);

      // Spawn if player close
      if (!spawn.active && dist < this.spawnRadius) {
        this.spawnEnemy(spawn, false);
      }
    }

    // Despawn active enemies if too far
    for (const enemy of [...this.activeEnemies]) {
      if (!enemy || enemy.dead || !enemy.spawnRef) continue;
      const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      if (enemy.spawnRef.active && dist > this.despawnRadius) {
        this.despawnEnemy(enemy.spawnRef);
      }
    }

    // Check elite spawns (spatial hash)
    const eliteCandidates = (this.eliteGrid ? this.eliteGrid.query(player.x, player.y, this.spawnRadius) : this.currentZone.eliteSpawns);
    for (const spawn of eliteCandidates) {
      if (spawn.killed) continue;

      const dist = Math.hypot(player.x - spawn.x, player.y - spawn.y);

      if (!spawn.active && dist < this.spawnRadius) {
        this.spawnEnemy(spawn, true);
      }
    }

    // Check boss spawn
    if (this.currentZone.bossSpawn && !this.currentZone.bossSpawn.killed) {
      const spawn = this.currentZone.bossSpawn;
      const dist = Math.hypot(player.x - spawn.x, player.y - spawn.y);
      
      if (!spawn.active && dist < this.spawnRadius * 1.5) {
        this.spawnBoss(spawn);
      }
    }
    
    // Check exit collision
    if (this.currentZone.exit) {
      const exit = this.currentZone.exit;
      const dist = Math.hypot(player.x - exit.x, player.y - exit.y);
      
      if (dist < 50) {
        this.onExitReached();
      }
    }
    
    // Check portal collision
    for (const portal of this.currentZone.portals) {
      const dist = Math.hypot(player.x - portal.x, player.y - portal.y);
      if (dist < 60) {
        this.onPortalEnter(portal);
      }
    }
    
    // Update patrol behavior for active enemies
    this.updateEnemyPatrols(dt);
  },
  // Spawn regular enemy
  spawnEnemy(spawn, isElite = false) {
    const { Enemies } = State.modules;

    // Create enemy (combat scaling handled in Enemies.spawn via depth/world scaling)
    const enemy = Enemies.spawn(spawn.type, spawn.x, spawn.y, isElite, false);
    enemy.spawnRef = spawn;

    // Display level from depth (exploration) or player level fallback
    const depth = State.world?.currentZone?.depth || (State.meta.level || 1);
    enemy.level = depth;

    // Patrol setup (deterministic per zone if rngEncounters is present)
    enemy.patrol = spawn.patrol;
    enemy.patrolRadius = spawn.patrolRadius;
    enemy.patrolOrigin = { x: spawn.x, y: spawn.y };
    const r = this.rngEncounters ? this.rngEncounters.next() : Math.random();
    enemy.patrolAngle = r * Math.PI * 2;

    spawn.active = true;
    spawn.enemyId = enemy.id;

    this.activeEnemies.push(enemy);
  },
  // Spawn boss
  spawnBoss(spawn) {
    const { Enemies } = State.modules;

    const enemy = Enemies.spawn(spawn.type, spawn.x, spawn.y, false, true);
    enemy.spawnRef = spawn;

    const depth = State.world?.currentZone?.depth || (State.meta.level || 1);
    enemy.level = depth;

    spawn.active = true;
    spawn.enemyId = enemy.id;

    // Announce boss
    State.ui?.showAnnouncement?.(`⚠️ ${enemy.name || 'BOSS'} APPEARS!`);

    this.activeEnemies.push(enemy);
  },

  
  // Despawn enemy (too far)
  despawnEnemy(spawn) {
    // Remove from State.enemies
    const idx = State.enemies.findIndex(e => e.id === spawn.enemyId);
    if (idx !== -1) {
      State.enemies.splice(idx, 1);
    }
    
    spawn.active = false;
    spawn.enemyId = null;
    
    // Remove from active list
    this.activeEnemies = this.activeEnemies.filter(e => e.spawnRef !== spawn);
  },
  
  // Called when enemy dies
  onEnemyKilled(enemy) {
    if (enemy.spawnRef) {
      enemy.spawnRef.killed = true;
      enemy.spawnRef.active = false;
    }
    
    // Check if boss
    if (enemy.isBoss && this.currentZone.bossSpawn) {
      this.onBossKilled();
    }
  },
  
  // Boss killed - spawn portal
  onBossKilled() {
    State.ui?.showAnnouncement?.('✨ PORTAL OPENED!');
    
    // Spawn portal to hub
    this.currentZone.portals.push({
      x: this.currentZone.width / 2,
      y: this.currentZone.height / 2,
      destination: 'hub',
      type: 'victory'
    });
  },
  
  // Player reached zone exit
  onExitReached() {
    const nextZone = this.zoneIndex + 1;
    this.loadZone(nextZone);
  },
  
  // Player entered portal
  onPortalEnter(portal) {
    if (portal.destination === 'hub') {
      // Transition to hub
      State.scene = 'hub';
      State.ui?.renderHub?.();
    } else if (portal.destination) {
      // Load specific act/zone
      this.init(portal.destination);
    }
  },
  
  // Update enemy patrol behavior
  updateEnemyPatrols(dt) {
    for (const enemy of this.activeEnemies) {
      if (!enemy.patrol || enemy.dead) continue;
      
      switch (enemy.patrol) {
        case 'circle':
          enemy.patrolAngle += dt * 0.5;
          enemy.x = enemy.patrolOrigin.x + Math.cos(enemy.patrolAngle) * enemy.patrolRadius;
          enemy.y = enemy.patrolOrigin.y + Math.sin(enemy.patrolAngle) * enemy.patrolRadius;
          break;
          
        case 'line':
          enemy.patrolAngle += dt * 0.8;
          enemy.x = enemy.patrolOrigin.x + Math.sin(enemy.patrolAngle) * enemy.patrolRadius;
          break;
          
        case 'wander':
          // Random direction changes
          if (Math.random() < dt * 0.5) {
            enemy.vx = (Math.random() - 0.5) * enemy.speed;
            enemy.vy = (Math.random() - 0.5) * enemy.speed;
          }
          // Stay near origin
          const dist = Math.hypot(
            enemy.x - enemy.patrolOrigin.x,
            enemy.y - enemy.patrolOrigin.y
          );
          if (dist > enemy.patrolRadius) {
            const angle = Math.atan2(
              enemy.patrolOrigin.y - enemy.y,
              enemy.patrolOrigin.x - enemy.x
            );
            enemy.vx = Math.cos(angle) * enemy.speed * 0.5;
            enemy.vy = Math.sin(angle) * enemy.speed * 0.5;
          }
          break;
      }
    }
  },
  
  // Draw zone elements (obstacles, decorations)
  draw(ctx, screenW, screenH) {
    if (!this.currentZone) return;
    // Draw decorations (behind everything)
    for (const dec of this.currentZone.decorations) {
      if (!Camera.isVisible(dec.x, dec.y, 200, screenW, screenH)) continue;
      
      ctx.globalAlpha = dec.alpha;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(dec.x, dec.y, 5 * dec.scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    
    // Draw obstacles
    for (const obs of this.currentZone.obstacles) {
      if (!Camera.isVisible(obs.x, obs.y, 100, screenW, screenH)) continue;
      
      ctx.save();
      ctx.translate(obs.x, obs.y);
      ctx.rotate(obs.rotation || 0);
      
      // Draw based on type
      switch (obs.type) {
        case 'asteroid':
          ctx.fillStyle = '#555566';
          ctx.beginPath();
          ctx.arc(0, 0, obs.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#333344';
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
          
        case 'debris':
          ctx.fillStyle = '#444455';
          ctx.fillRect(-obs.radius, -obs.radius/2, obs.radius*2, obs.radius);
          break;
          
        case 'mine':
          ctx.fillStyle = '#ff4444';
          ctx.beginPath();
          ctx.arc(0, 0, obs.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffff00';
          ctx.beginPath();
          ctx.arc(0, 0, obs.radius * 0.4, 0, Math.PI * 2);
          ctx.fill();
          break;
          
        case 'pillar':
          ctx.fillStyle = '#667788';
          ctx.beginPath();
          ctx.arc(0, 0, obs.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#8899aa';
          ctx.lineWidth = 3;
          ctx.stroke();
          break;
      }
      
      ctx.restore();
    }
    
    // Draw exit marker
    if (this.currentZone.exit) {
      const exit = this.currentZone.exit;
      ctx.fillStyle = '#00ff88';
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(exit.x, exit.y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText('EXIT', exit.x, exit.y + 5);
    }
    
    // Draw portals
    for (const portal of this.currentZone.portals) {
      const pulse = Math.sin(Date.now() / 200) * 0.3 + 0.7;
      ctx.fillStyle = portal.type === 'victory' ? '#ffdd00' : '#8800ff';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 30 * pulse;
      ctx.beginPath();
      ctx.arc(portal.x, portal.y, 40 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText('PORTAL', portal.x, portal.y + 5);
    }
  },
  
  // Draw parallax background layers
  drawParallax(ctx, screenW, screenH) {
    if (!this.currentZone?.parallax) return;
    
    const parallax = this.currentZone.parallax;
    const camX = Camera.getX();
    const camY = Camera.getY();
    
    // Layer 0: Background color
    ctx.fillStyle = parallax.background.color;
    ctx.fillRect(0, 0, screenW, screenH);
    
    // Layer 0: Deep stars
    const bgOffsetX = camX * parallax.background.scrollSpeed;
    const bgOffsetY = camY * parallax.background.scrollSpeed;
    
    ctx.fillStyle = '#ffffff';
    for (const star of parallax.background.stars) {
      const x = ((star.x - bgOffsetX) % screenW + screenW) % screenW;
      const y = ((star.y - bgOffsetY) % screenH + screenH) % screenH;
      
      let brightness = star.brightness;
      if (star.twinkle) {
        brightness *= 0.5 + Math.sin(Date.now() / 500 + star.x) * 0.5;
      }
      
      ctx.globalAlpha = brightness;
      ctx.beginPath();
      ctx.arc(x, y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Layer 1: Mid stars
    const midOffsetX = camX * parallax.midground.scrollSpeed;
    const midOffsetY = camY * parallax.midground.scrollSpeed;
    
    for (const star of parallax.midground.stars) {
      const x = ((star.x - midOffsetX) % screenW + screenW) % screenW;
      const y = ((star.y - midOffsetY) % screenH + screenH) % screenH;
      
      ctx.globalAlpha = star.brightness;
      ctx.beginPath();
      ctx.arc(x, y, star.size * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.globalAlpha = 1;
    
    // Layer 2: Nebula wisps
    if (parallax.foreground.objects) {
      const fgOffsetX = camX * parallax.foreground.scrollSpeed;
      const fgOffsetY = camY * parallax.foreground.scrollSpeed;
      
      for (const wisp of parallax.foreground.objects) {
        const x = wisp.x - fgOffsetX;
        const y = wisp.y - fgOffsetY;
        
        ctx.globalAlpha = wisp.alpha;
        ctx.fillStyle = wisp.color;
        ctx.beginPath();
        ctx.ellipse(x, y, wisp.width / 2, wisp.height / 2, wisp.rotation, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.globalAlpha = 1;
    }
  }
};

export default World;