# BONZOOKAA v2 – Patchset: World-Coordinaten + Endless-Depth Stabilität

## Ziel
- Gegner/Deco/Obstacles korrekt in World-Koordinaten rendern (keine Kopplung an Spielerposition)
- Offscreen-Despawn/Kill-Logik auf Zone-/World-Mode umstellen
- Seed/RNG für sehr große Zone-Indizes stabilisieren (uint32, Seed-Mixing)

## Geänderte Dateien
- main.js
- runtime/world/World.js
- runtime/Enemies.js
- runtime/Bullets.js
- runtime/Pickups.js
- runtime/world/SeededRandom.js
- runtime/world/MapGenerator.js

## Deployment
- ZIP entpacken und 1:1 auf GitHub Pages deployen (Branch/Folder wie bisher).
- Optional: Browser-Cache leeren oder Cache-Busting via Querystring.

## Validierung
- In Exploration Mode: weit (>2000px) in X/Y bewegen. Gegner und Deco müssen weiterhin sichtbar/spawnfähig sein.
- Keine 'Off screen' Kills basierend auf Canvas-Größe im World-Mode.
