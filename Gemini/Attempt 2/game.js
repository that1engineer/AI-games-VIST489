const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let lastTime = 0, gameTime = 0;

const player = { x: 400, y: 300, hp: 100, speed: 150, weapons: [/* initialized from data */] };
let enemies = [], bullets = [], pickups = [];

function update(dt) {
    gameTime += dt;
    const timeInMins = gameTime / 60000;
    
    // Player Movement (Keyboard pseudo-check)
    if (keys['KeyW']) player.y -= player.speed * dt;
    // ... handle A, S, D
    
    // Weapon Auto-Fire
    player.weapons.forEach(wpn => {
        wpn.timer -= dt;
        if (wpn.timer <= 0) {
            fireWeapon(wpn, player);
            wpn.timer = wpn.cooldown;
        }
    });

    // Enemy Spawning Math
    const maxEnemies = 30 + (15 * timeInMins);
    if (enemies.length < maxEnemies && Math.random() < 0.05) {
        spawnEnemy(timeInMins);
    }

    // Enemy Update & Collision
    enemies.forEach((enemy, eIdx) => {
        // Move towards player
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const dist = Math.hypot(dx, dy);
        enemy.x += (dx / dist) * enemy.speed * dt;
        enemy.y += (dy / dist) * enemy.speed * dt;

        // Player Collision
        if (dist < 15) player.hp -= enemy.damage * dt; // Simple continuous damage

        // Bullet Collision
        bullets.forEach((bullet, bIdx) => {
            if (Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) < 10) {
                enemy.hp -= bullet.damage;
                bullets.splice(bIdx, 1); // remove bullet (assuming no pierce)
                if (enemy.hp <= 0) {
                    pickups.push({x: enemy.x, y: enemy.y, type: 'xp'});
                    enemies.splice(eIdx, 1);
                }
            }
        });
    });

    // Pickup Collection
    pickups.forEach((p, pIdx) => {
        if (Math.hypot(player.x - p.x, player.y - p.y) < 50) { // Magnet radius
            gainXP(1);
            pickups.splice(pIdx, 1);
        }
    });
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw Pickups, Enemies, Bullets, Player...
    ctx.fillStyle = 'blue'; ctx.fillRect(player.x, player.y, 20, 20);
    enemies.forEach(e => { ctx.fillStyle = 'red'; ctx.fillRect(e.x, e.y, 16, 16); });
}

function loop(timestamp) {
    const dt = (timestamp - lastTime) / 1000; // seconds
    lastTime = timestamp;
    update(dt);
    draw();
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);