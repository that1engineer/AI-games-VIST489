const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const keys = {};

let GAME_DATA = { players: {}, enemies: {}, system: {}, images: {} };
let gameState = 'LOADING'; 
let lastTime = 0, gameTime = 0, kills = 0;

let player = { x: 400, y: 300, size: 16, level: 1, xp: 0, xpNeeded: 10, wpnTimer: 0 };
let enemies = [], bullets = [], pickups = [];

window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

// ==========================================
// EMBEDDED DATA (No server required!)
// ==========================================

const RAW_CSV = `id,category,name,base_hp,base_atk,base_spd,xp_value,spawn_weight,scaling_factor,image_ref
char_jax,player,Jax,100,15,180,0,0,0,images/jax_sprite.png
char_nova,player,Nova,80,25,160,0,0,0,images/nova_sprite.png
en_scrapling,enemy,Scrapling,10,10,40,1,80,0.15,images/scrapling.png
en_hound,enemy,Chrome-Hound,35,15,90,3,20,0.20,images/hound.png
en_gargantua,enemy,Junk-Gargantua,800,30,25,50,1,0.50,images/gargantua.png
sys_spawn_rate,system,Base Spawn Delay,0,0,1000,0,0,-80,MISSING_IMAGE
sys_max_enemies,system,Base Max Enemies,30,0,0,0,0,15,MISSING_IMAGE`;

const IMAGE_MAP = {
  "images/jax_sprite.png": { "path": "./assets/sprites/characters/jax.png", "caption": "Top-down sprite for Jax", "used_by": ["char_jax"] },
  "images/nova_sprite.png": { "path": "./assets/sprites/characters/nova.png", "caption": "Top-down sprite for Nova", "used_by": ["char_nova"] },
  "images/scrapling.png": { "path": "./assets/sprites/enemies/scrapling.png", "caption": "Sprite of the Scrapling swarm enemy", "used_by": ["en_scrapling"] },
  "images/hound.png": { "path": "./assets/sprites/enemies/hound.png", "caption": "Sprite of the Chrome-Hound dasher", "used_by": ["en_hound"] },
  "images/gargantua.png": { "path": "./assets/sprites/enemies/gargantua.png", "caption": "Sprite of the Junk-Gargantua elite boss", "used_by": ["en_gargantua"] }
};

// --- Initialization ---
function init() {
    try {
        GAME_DATA.images = IMAGE_MAP;
        parseCSV(RAW_CSV);
        
        document.getElementById('loading-text').style.display = 'none';
        document.getElementById('char-select').style.display = 'block';
        gameState = 'MENU';
    } catch (err) {
        document.getElementById('loading-text').innerText = "Error parsing data.";
        console.error(err);
    }
}

function parseCSV(csv) {
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',');
    
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const row = {};
        headers.forEach((h, idx) => row[h.trim()] = isNaN(cols[idx]) ? cols[idx] : Number(cols[idx]));
        
        if (row.category === 'player') GAME_DATA.players[row.id] = row;
        else if (row.category === 'enemy') GAME_DATA.enemies[row.id] = row;
        else if (row.category === 'system') GAME_DATA.system[row.id] = row;
    }
}

// --- Core Logic ---
function startGame(classId) {
    const charData = GAME_DATA.players[classId];
    player.id = charData.id;
    player.maxHp = player.hp = charData.base_hp;
    player.atk = charData.base_atk;
    player.spd = charData.base_spd;

    document.getElementById('menu-start').classList.remove('active');
    gameState = 'PLAYING';
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function spawnEnemy(mins) {
    const maxEnemiesBase = GAME_DATA.system.sys_max_enemies.base_hp; 
    const maxEnemiesScaling = GAME_DATA.system.sys_max_enemies.scaling_factor;
    if (enemies.length >= maxEnemiesBase + (maxEnemiesScaling * mins)) return;

    const enemyTypes = Object.values(GAME_DATA.enemies);
    const totalWeight = enemyTypes.reduce((sum, e) => sum + e.spawn_weight, 0);
    let randomVal = Math.random() * totalWeight;
    let selectedEnemy = enemyTypes[0];
    
    for (let e of enemyTypes) {
        if (randomVal < e.spawn_weight) { selectedEnemy = e; break; }
        randomVal -= e.spawn_weight;
    }

    const hpMult = 1 + (selectedEnemy.scaling_factor * mins);
    const angle = Math.random() * Math.PI * 2;
    
    enemies.push({
        ...selectedEnemy,
        x: player.x + Math.cos(angle) * 500,
        y: player.y + Math.sin(angle) * 500,
        currentHp: selectedEnemy.base_hp * hpMult,
        maxHp: selectedEnemy.base_hp * hpMult,
        size: selectedEnemy.id === 'en_gargantua' ? 24 : 12
    });
}

function update(dt) {
    gameTime += dt;
    const mins = gameTime / 60;

    let dx = 0, dy = 0;
    if (keys['KeyW'] || keys['ArrowUp']) dy -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) dy += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) dx += 1;
    
    if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        player.x += (dx / len) * player.spd * dt;
        player.y += (dy / len) * player.spd * dt;
    }
    player.x = Math.max(player.size, Math.min(canvas.width - player.size, player.x));
    player.y = Math.max(player.size, Math.min(canvas.height - player.size, player.y));

    const baseDelay = GAME_DATA.system.sys_spawn_rate.base_spd;
    const delayScaling = GAME_DATA.system.sys_spawn_rate.scaling_factor;
    const currentDelay = Math.max(200, baseDelay + (delayScaling * mins)) / 1000;
    
    if (Math.random() < dt / currentDelay) spawnEnemy(mins);

    player.wpnTimer -= dt;
    if (player.wpnTimer <= 0 && enemies.length > 0) {
        let target = enemies[0], minDist = Infinity;
        enemies.forEach(e => {
            const d = Math.hypot(player.x - e.x, player.y - e.y);
            if (d < minDist) { minDist = d; target = e; }
        });
        const angle = Math.atan2(target.y - player.y, target.x - player.x);
        bullets.push({
            x: player.x, y: player.y, vx: Math.cos(angle)*400, vy: Math.sin(angle)*400,
            damage: player.atk, life: 2.0
        });
        player.wpnTimer = 0.8;
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.life <= 0) { bullets.splice(i, 1); continue; }
        
        let hit = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
            let e = enemies[j];
            if (Math.hypot(b.x - e.x, b.y - e.y) < e.size + 4) {
                e.currentHp -= b.damage; hit = true; break;
            }
        }
        if (hit) bullets.splice(i, 1);
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        if (e.currentHp <= 0) {
            pickups.push({ x: e.x, y: e.y, val: e.xp_value });
            enemies.splice(i, 1); kills++; continue;
        }
        const dist = Math.hypot(player.x - e.x, player.y - e.y);
        e.x += ((player.x - e.x) / dist) * e.base_spd * dt;
        e.y += ((player.y - e.y) / dist) * e.base_spd * dt;

        if (dist < player.size + e.size) {
            player.hp -= e.base_atk * dt;
            if (player.hp <= 0) {
                gameState = 'GAMEOVER';
                document.getElementById('final-stats').innerText = `Time: ${Math.floor(mins)}m ${Math.floor(gameTime%60)}s | Kills: ${kills}`;
                document.getElementById('menu-gameover').classList.add('active');
            }
        }
    }

    for (let i = pickups.length - 1; i >= 0; i--) {
        let p = pickups[i];
        const dist = Math.hypot(player.x - p.x, player.y - p.y);
        if (dist < 80) {
            p.x += (player.x - p.x) * 5 * dt; p.y += (player.y - p.y) * 5 * dt;
            if (dist < player.size + 5) {
                player.xp += p.val; pickups.splice(i, 1);
                if (player.xp >= player.xpNeeded) {
                    player.level++; player.xp -= player.xpNeeded; player.xpNeeded *= 1.5;
                    player.atk += 2; 
                }
            }
        }
    }

    document.getElementById('ui-level').innerText = `Level: ${player.level}`;
    document.getElementById('ui-time').innerText = `${Math.floor(mins).toString().padStart(2,'0')}:${Math.floor(gameTime%60).toString().padStart(2,'0')}`;
    document.getElementById('ui-kills').innerText = `Kills: ${kills}`;
    document.getElementById('xp-bar').style.width = `${Math.min(100, (player.xp / player.xpNeeded) * 100)}%`;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#0f0';
    pickups.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); });

    enemies.forEach(e => {
        ctx.fillStyle = e.id === 'en_hound' ? '#f0f' : (e.id === 'en_gargantua' ? '#f90' : '#f00');
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'lime'; ctx.fillRect(e.x - 10, e.y - e.size - 6, 20 * Math.max(0, e.currentHp / e.maxHp), 3);
    });

    ctx.fillStyle = '#0ff';
    bullets.forEach(b => { ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill(); });

    ctx.fillStyle = player.id === 'char_nova' ? '#f90' : '#0ff';
    ctx.beginPath(); ctx.arc(player.x, player.y, player.size, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'lime'; ctx.fillRect(player.x - 15, player.y + 20, 30 * Math.max(0, player.hp / player.maxHp), 4);
}

function gameLoop(timestamp) {
    if (gameState !== 'PLAYING') return;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;
    update(dt); draw();
    requestAnimationFrame(gameLoop);
}

init();