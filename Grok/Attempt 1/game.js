const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 1200, H = 800;
canvas.width = W; canvas.height = H;

let player = {
    x: W/2, y: H/2,
    hp: 100, maxHp: 100,
    speed: 3.2,
    level: 1,
    xp: 0,
    xpToNext: 80,
    kills: 0
};

let enemies = [];
let projectiles = [];
let pickups = [];
let time = 0; // seconds
let lastTime = Date.now();
let gameRunning = true;
let keys = {};

let weapons = [{
    name: "Veil Darts",
    damage: 11,
    rate: 1.4,      // attacks per second
    lastFire: 0,
    count: 3,
    range: 420
}];

const enemyTypes = [
    {name:"Shadowling", hp:15, speed:1.6, color:"#662288", size:18, weight:50},
    {name:"Blight Bat", hp:9,  speed:2.4, color:"#aa44aa", size:14, weight:30},
    {name:"Rootfiend",  hp:32, speed:0.9, color:"#228822", size:24, weight:20}
];

function spawnEnemy() {
    if (!gameRunning) return;
    const t = time / 60; // minutes
    const density = 0.6 + 0.35 * t; // increases over time
    
    if (Math.random() < density / 30) { // rough per-frame spawn chance
        const type = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.max(W,H) * 0.6;
        
        enemies.push({
            x: player.x + Math.cos(angle) * dist,
            y: player.y + Math.sin(angle) * dist,
            hp: type.hp * (1 + 0.18 * t),
            maxHp: type.hp * (1 + 0.18 * t),
            speed: type.speed,
            color: type.color,
            size: type.size,
            angle: 0
        });
    }
}

function fireWeapons() {
    const now = Date.now();
    weapons.forEach(w => {
        if (now - w.lastFire > 1000 / w.rate) {
            w.lastFire = now;
            for (let i = 0; i < w.count; i++) {
                const spread = (i - (w.count-1)/2) * 0.3;
                const vx = Math.cos(spread) * 7;
                const vy = Math.sin(spread) * 7;
                projectiles.push({
                    x: player.x,
                    y: player.y,
                    vx: vx,
                    vy: vy,
                    damage: w.damage,
                    life: 60 // frames
                });
            }
        }
    });
}

function update() {
    if (!gameRunning) return;
    
    const now = Date.now();
    const delta = (now - lastTime) / 1000;
    lastTime = now;
    time += delta;

    // Player movement
    let dx = 0, dy = 0;
    if (keys['w'] || keys['ArrowUp']) dy -= 1;
    if (keys['s'] || keys['ArrowDown']) dy += 1;
    if (keys['a'] || keys['ArrowLeft']) dx -= 1;
    if (keys['d'] || keys['ArrowRight']) dx += 1;
    
    if (dx || dy) {
        const len = Math.hypot(dx, dy);
        player.x += (dx / len) * player.speed;
        player.y += (dy / len) * player.speed;
    }
    
    // Clamp player
    player.x = Math.max(30, Math.min(W-30, player.x));
    player.y = Math.max(30, Math.min(H-30, player.y));

    // Auto weapons
    fireWeapons();

    // Update projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) {
            projectiles.splice(i, 1);
            continue;
        }
        
        // Enemy collision
        for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (Math.hypot(p.x - e.x, p.y - e.y) < e.size + 8) {
                e.hp -= p.damage;
                projectiles.splice(i, 1);
                if (e.hp <= 0) {
                    player.kills++;
                    // Drop XP orb
                    pickups.push({x: e.x, y: e.y, type:'xp', value: 12});
                    enemies.splice(j, 1);
                }
                break;
            }
        }
    }

    // Update enemies
    enemies.forEach(e => {
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        e.x += (dx / dist) * e.speed;
        e.y += (dy / dist) * e.speed;
        
        // Contact damage
        if (Math.hypot(e.x - player.x, e.y - player.y) < e.size + 22) {
            player.hp -= 0.4; // per frame contact
        }
    });

    // Pickups
    for (let i = pickups.length - 1; i >= 0; i--) {
        const p = pickups[i];
        const dx = player.x - p.x;
        const dy = player.y - p.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < 60) {
            const pull = 8;
            p.x += (dx / dist) * pull;
            p.y += (dy / dist) * pull;
        }
        
        if (dist < 28) {
            if (p.type === 'xp') {
                player.xp += p.value;
                if (player.xp >= player.xpToNext) {
                    player.level++;
                    player.xp = 0;
                    player.xpToNext = Math.floor(player.xpToNext * 1.35);
                    showLevelUp();
                }
            }
            pickups.splice(i, 1);
        }
    }

    // Spawn logic
    spawnEnemy();

    // Win/lose conditions
    if (player.hp <= 0) {
        gameRunning = false;
        document.getElementById('gameover').style.display = 'block';
        document.getElementById('finaltime').textContent = formatTime(time);
        document.getElementById('kills').textContent = player.kills;
    }
    
    // Update HUD
    document.getElementById('timer').textContent = formatTime(time);
    document.getElementById('level').textContent = player.level;
    document.getElementById('hp').textContent = Math.max(0, Math.floor(player.hp));
}

function formatTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function draw() {
    // Dark forest bg
    ctx.fillStyle = '#1a0f2e';
    ctx.fillRect(0, 0, W, H);
    
    // Simple ground fog
    ctx.fillStyle = 'rgba(40,20,60,0.4)';
    ctx.fillRect(0, H*0.6, W, H*0.4);

    // Player (Nocturne - purple hooded figure)
    ctx.fillStyle = '#bb77ff';
    ctx.beginPath();
    ctx.arc(player.x, player.y, 22, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#330044';
    ctx.fillRect(player.x-10, player.y-18, 20, 12); // hood

    // Enemies
    enemies.forEach(e => {
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI*2);
        ctx.fill();
    });

    // Projectiles (glowing darts)
    ctx.fillStyle = '#aaffff';
    projectiles.forEach(p => {
        ctx.fillRect(p.x-4, p.y-2, 12, 4);
    });

    // Pickups (blood orbs)
    ctx.fillStyle = '#ff2244';
    pickups.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#ffeeaa';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI*2);
        ctx.fill();
    });
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function showLevelUp() {
    gameRunning = false; // pause
    const modal = document.getElementById('levelup');
    const choicesDiv = document.getElementById('choices');
    choicesDiv.innerHTML = '';
    
    // Simple choices: upgrade existing or new weapon / stat
    const options = [
        "Veil Darts +1 projectile (+damage)",
        "+25% Movement Speed",
        "+20 Max HP",
        "New Weapon: Crimson Lash"
    ];
    
    options.forEach((text, i) => {
        const div = document.createElement('div');
        div.className = 'choice';
        div.textContent = text;
        div.onclick = () => {
            // Apply simple upgrade
            if (i === 0) {
                weapons[0].count++;
                weapons[0].damage += 3;
            } else if (i === 1) {
                player.speed += 0.8;
            } else if (i === 2) {
                player.maxHp += 20;
                player.hp += 20;
            } else if (i === 3) {
                weapons.push({
                    name: "Crimson Lash",
                    damage: 16,
                    rate: 1.0,
                    lastFire: 0,
                    count: 1,
                    range: 220
                });
            }
            modal.style.display = 'none';
            gameRunning = true;
        };
        choicesDiv.appendChild(div);
    });
    
    modal.style.display = 'block';
}

function restart() {
    // Reset game
    player = {x: W/2, y: H/2, hp:100, maxHp:100, speed:3.2, level:1, xp:0, xpToNext:80, kills:0};
    enemies = [];
    projectiles = [];
    pickups = [];
    weapons = [{
        name: "Veil Darts",
        damage: 11,
        rate: 1.4,
        lastFire: 0,
        count: 3,
        range: 420
    }];
    time = 0;
    gameRunning = true;
    document.getElementById('gameover').style.display = 'none';
    document.getElementById('levelup').style.display = 'none';
}

// Input
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

// Touch support (basic)
canvas.addEventListener('touchmove', e => {
    if (!gameRunning) return;
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    player.x = touch.clientX - rect.left;
    player.y = touch.clientY - rect.top;
});

gameLoop();

// Initial spawn help
setTimeout(() => { enemies.push({x:200,y:200,hp:20,speed:1.4,color:"#662288",size:18}); }, 800);