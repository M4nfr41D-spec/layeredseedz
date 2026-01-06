// Copyright (c) Manfred Foissner. All rights reserved.
// License: See LICENSE.txt in the project root.

// ============================================================
// Input.js - Desktop Input (WASD + Mouse)
// ============================================================

import { State } from './State.js';
import { World } from './world/World.js';

export const Input = {
  canvas: null,
  canvasRect: null,
  
  init(canvas) {
    this.canvas = canvas;
    this.updateRect();
    
    // Keyboard
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    
    // Mouse
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Track canvas position for resize
    window.addEventListener('resize', () => this.updateRect());
    
    // Prevent space scrolling
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
      }
    });
  },
  
  updateRect() {
    if (this.canvas) {
      this.canvasRect = this.canvas.getBoundingClientRect();
    }
  },
  
  onKeyDown(e) {
    const input = State.input;

    // Dev hotkeys (SHIFT+N/P/L) for rapid zone variety smoke-tests
    const dev = State.data?.config?.debug?.devHotkeys;
    if (dev && e.shiftKey) {
      if (e.code === 'KeyN') {
        // Next zone
        try {
          const next = (World.zoneIndex ?? 0) + 1;
          World.loadZone(next);
          console.log('[DEV] Next zone ->', next + 1, World.currentZone);
        } catch (err) {
          console.error('[DEV] Next zone failed', err);
        }
        return;
      }
      if (e.code === 'KeyP') {
        // Previous zone (clamped)
        try {
          const prev = Math.max(0, (World.zoneIndex ?? 0) - 1);
          World.loadZone(prev);
          console.log('[DEV] Prev zone ->', prev + 1, World.currentZone);
        } catch (err) {
          console.error('[DEV] Prev zone failed', err);
        }
        return;
      }
      if (e.code === 'KeyL') {
        // Log current zone summary
        const z = World.currentZone;
        if (z) {
          console.log('[DEV] Zone summary', {
            depth: z.depth, seed: z.seed, layout: z.layout, backdrop: z.backdrop,
            mods: z.mods, enemySpawns: z.enemySpawns?.length, eliteSpawns: z.eliteSpawns?.length,
            obstacles: z.obstacles?.length, sig: z.signature
          });
        } else {
          console.log('[DEV] No current zone');
        }
        return;
      }
    }
    
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        input.up = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        input.down = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        input.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        input.right = true;
        break;
      case 'Space':
        input.fire = true;
        break;
    }
  },
  
  onKeyUp(e) {
    const input = State.input;
    
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        input.up = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        input.down = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        input.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        input.right = false;
        break;
      case 'Space':
        input.fire = false;
        break;
    }
  },
  
  onMouseMove(e) {
    this.updateRect();
    
    // Convert to canvas coordinates
    State.input.mouseX = e.clientX - this.canvasRect.left;
    State.input.mouseY = e.clientY - this.canvasRect.top;
  },
  
  onMouseDown(e) {
    if (e.button === 0) { // Left click
      State.input.fire = true;
    }
  },
  
  onMouseUp(e) {
    if (e.button === 0) {
      State.input.fire = false;
    }
  },
  
  // Get movement vector from WASD
  getMovement() {
    const input = State.input;
    let dx = 0, dy = 0;
    
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    
    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
    }
    
    return { dx, dy };
  },
  
  // Get angle from player to mouse
  getAimAngle(playerX, playerY) {
    const mx = State.input.mouseX;
    const my = State.input.mouseY;
    return Math.atan2(my - playerY, mx - playerX);
  }
};

export default Input;
