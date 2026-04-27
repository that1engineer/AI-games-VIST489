const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 1200, H = 800;

let player = {};
let enemies = [];
let projectiles = [];
let pickups = [];
let time = 0;
let gameRunning = true;
let keys = {};
let weapons = [];

// Load CSV data
let gameData = [];

// Simple CSV parser
function loadCSV() {
    // Paste the entire game_data.csv content here as string
    const csv = `category,id,name,base_hp,base_speed,base_damage,attack_rate,projectile_count,spawn_weight,scaling_hp,scaling_speed,scaling_spawn,ai_behavior,image_sprite,image_icon,starting_for,passive,notes
player,nocturne,Nocturne,100,3.2,11,1.4,3,0,1.0,1.0,1.0,simple,images/sprites/nocturne.png,images/icons/nocturne_icon.png,nocturne,+15% move speed,Shadow wanderer starter
player,sanguine,Sanguine,110,2.9,14,0.9,1,0,1.0,1.0,1.0,simple,images/sprites/sanguine.png,images/icons/sanguine_icon.png,sanguine,+10% dmg on low HP,
player,lunar,Lunar,95,3.0,11,2.0,2,0,1.0,1.0,1.0,simple,images/sprites/lunar.png,images/icons/lunar_icon.png,lunar,+20% area size,
player,thornheart,Thornheart,120,2.7,7,0.8,1,0,1.0,1.0,1.0,simple,images/sprites/thornheart.png,images/icons/thornheart_icon.png,thornheart,15% slow aura,
player,eclipse,Eclipse,105,3.1,18,0.6,1,0,1.0,1.0,1.0,simple,images/sprites/eclipse.png,images/icons/eclipse_icon.png,eclipse,+1 proj every 5 lvls,
player,vesper,Vesper,100,2.8,10,1.5,2,0,1.0,1.0,1.0,simple,images/sprites/vesper.png,images/icons/vesper_icon.png,vesper,+8% XP gain,
enemy,shadowling,Shadowling,15,1.6,8,0,0,40,1.18,1.0,1.22,simple_chase,images/sprites/enemies/shadowling.png,images/icons/enemies/shadowling.png,,,
enemy,blight_bat,Blight Bat,9,2.4,6,0,0,30,1.08,1.08,1.15,arc_dive,images/sprites/enemies/blight_bat.png,images/icons/enemies/blight_bat.png,,,
enemy,rootfiend,Rootfiend,32,0.9,12,0,0,20,1.15,1.0,1.10,leave_slow_trail,images/sprites/enemies/rootfiend.png,images/icons/enemies/rootfiend.png,,,
enemy,howler,Howler,18,1.5,9,0,0,10,1.10,1.05,1.12,buff_nearby,images/sprites/enemies/howler.png,images/icons/enemies/howler.png,,,
enemy,venom_wisp,Venom Wisp,10,1.8,5,0,0,20,1.12,1.10,1.20,leave_poison,images/sprites/enemies/venom_wisp.png,images/icons/enemies/venom_wisp.png,,,
enemy,bone_stalker,Bone Stalker,22,1.9,10,0,0,12,1.18,1.0,1.15,straight_charge,images/sprites/enemies/bone_stalker.png,images/icons/enemies/bone_stalker.png,,,
enemy,gloom_spider,Gloom Spider,14,1.4,7,0,0,8,1.12,1.0,1.10,shoot_web,images/sprites/enemies/gloom_spider.png,images/icons/enemies/gloom_spider.png,,,
enemy,flesh_golem,Flesh Golem,60,1.0,15,0,0,5,1.25,1.0,1.08,split,images/sprites/enemies/flesh_golem.png,images/icons/enemies/flesh_golem.png,,,
enemy,nightmare_herald,Nightmare Herald,45,1.3,12,0,0,3,1.30,1.05,1.25,summon,images/sprites/enemies/nightmare_herald.png,images/icons/enemies/nightmare_herald.png,,,
enemy,bloodreaver,Bloodreaver,300,1.1,25,0,0,2,1.40,1.0,1.30,boss_pull,images/sprites/enemies/bloodreaver.png,images/icons/enemies/bloodreaver.png,,,
`;

    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',');
    gameData = lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((h, i) => obj[h.trim()] = values[i] ? values[i].trim() : '');
        return obj;
    });
}

function getEntity(id) {
    return gameData.find(row => row.id === id);
}

function initPlayer() {
    const pData = getEntity("nocturne");
    player = {
        x: W/2, y: H/2,
        hp: parseFloat(pData.base_hp),
        maxHp: parseFloat(pData.base_hp),
        speed: parseFloat(pData.base_speed),
        level: 1,
        xp: 0,
        xpToNext: 80,
        kills: 0
    };

    weapons = [{
        name: "Veil Darts",
        damage: parseFloat(pData.base_damage),
        rate: parseFloat(pData.attack_rate),
        lastFire: 0,
        count: parseInt(pData.projectile_count),
        image: pData.image_icon
    }];
}

function spawnEnemy() {
    if (!gameRunning) return;
    const t = time / 60;
    let totalWeight = 0;
    gameData.filter(r => r.category === "enemy").forEach(e => totalWeight += parseFloat(e.spawn_weight));

    let roll = Math.random() * totalWeight;
    for (let e of gameData.filter(r => r.category === "enemy")) {
        roll -= parseFloat(e.spawn_weight);
        if (roll <= 0) {
            const baseHp = parseFloat(e.base_hp);
            const scaledHp = baseHp * Math.pow(parseFloat(e.scaling_hp), t);
            const angle = Math.random() * Math.PI * 2;
            const dist = 520;

            enemies.push({
                id: e.id,
                x: player.x + Math.cos(angle) * dist,
                y: player.y + Math.sin(angle) * dist,
                hp: scaledHp,
                maxHp: scaledHp,
                speed: parseFloat(e.base_speed) * Math.pow(parseFloat(e.scaling_speed), t * 0.5),
                size: 20,
                image: e.image_sprite
            });
            return;
        }
    }
}

function fireWeapons() {
    const now = Date.now();
    weapons.forEach(w => {
        if (now - w.lastFire > 1000 / w.rate) {
            w.lastFire = now;
            for (let i = 0; i < w.count; i++) {
                const spread = (i - (w.count-1)/2) * 0.3;
                projectiles.push({
                    x: player.x,
                    y: player.y,
                    vx: Math.cos(spread) * 7.8,
                    vy: Math.sin(spread) * 7.8,
                    damage: w.damage,
                    life: 60
                });
            }
        }
    });
}

function update() {
    if (!gameRunning) return;
    time += 1/60;

    // Movement
    let dx = 0, dy = 0;
    if (keys['w'] || keys['ArrowUp']) dy -= 1;
    if (keys['s'] || keys['ArrowDown']) dy += 1;
    if (keys['a'] || keys['ArrowLeft']) dx -= 1;
    if (keys['d'] || keys['ArrowRight']) dx += 1;
    if (dx || dy) {
        const len = Math.hypot(dx, dy) || 1;
        player.x += (dx/len) * player.speed;
        player.y += (dy/len) * player.speed;
    }
    player.x = Math.max(30, Math.min(W-30, player.x));
    player.y = Math.max(30, Math.min(H-30, player.y));

    fireWeapons();

    // Update projectiles & collisions
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.x += p.vx; p.y += p.vy; p.life--;
        if (p.life <= 0) { projectiles.splice(i,1); continue; }

        for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (Math.hypot(p.x - e.x, p.y - e.y) < 28) {
                e.hp -= p.damage;
                projectiles.splice(i,1);
                if (e.hp <= 0) {
                    player.kills++;
                    pickups.push({x: e.x, y: e.y, type: 'xp', value: 12});
                    enemies.splice(j,1);
                }
                break;
            }
        }
    }

    // Enemies move & damage player
    enemies.forEach(e => {
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        e.x += (dx/d) * e.speed;
        e.y += (dy/d) * e.speed;

        if (Math.hypot(e.x - player.x, e.y - player.y) < 30) {
            player.hp -= 0.4;
        }
    });

    // Pickups
    for (let i = pickups.length - 1; i >= 0; i--) {
        const p = pickups[i];
        const dx = player.x - p.x;
        const dy = player.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 28) {
            player.xp += p.value;
            if (player.xp >= player.xpToNext) {
                player.level++;
                player.xp = 0;
                player.xpToNext = Math.floor(player.xpToNext * 1.35);
                showLevelUp();
            }
            pickups.splice(i,1);
        }
    }

    spawnEnemy();

    if (player.hp <= 0) {
        gameRunning = false;
        document.getElementById('gameover').style.display = 'block';
        document.getElementById('finaltime').textContent = `${Math.floor(time/60)}:${Math.floor(time%60).toString().padStart(2,'0')}`;
        document.getElementById('finalkills').textContent = player.kills;
    }

    // HUD update
    document.getElementById('timer').textContent = `${Math.floor(time/60)}:${Math.floor(time%60).toString().padStart(2,'0')}`;
    document.getElementById('level').textContent = player.level;
    document.getElementById('hp').textContent = Math.max(0, Math.floor(player.hp));
    document.getElementById('maxhp').textContent = Math.floor(player.maxHp);
    document.getElementById('kills').textContent = player.kills;
}

function draw() {
    ctx.fillStyle = '#1a0f2e';
    ctx.fillRect(0, 0, W, H);

    // Player
    ctx.fillStyle = '#bb77ff';
    ctx.beginPath(); ctx.arc(player.x, player.y, 22, 0, Math.PI*2); ctx.fill();

    // Enemies
    enemies.forEach(e => {
        ctx.fillStyle = '#662288';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, Math.PI*2); ctx.fill();
    });

    // Projectiles
    ctx.fillStyle = '#88ffff';
    projectiles.forEach(p => ctx.fillRect(p.x-5, p.y-3, 14, 6));

    // Pickups
    ctx.fillStyle = '#ff3366';
    pickups.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI*2); ctx.fill();
    });
}

function showLevelUp() {
    gameRunning = false;
    const modal = document.getElementById('levelup');
    const div = document.getElementById('choices');
    div.innerHTML = '';
    const opts = ["Upgrade current weapon", "+25% Speed", "+30 Max HP", "Add new weapon"];
    opts.forEach((text,i) => {
        const el = document.createElement('div');
        el.className = 'choice';
        el.textContent = text;
        el.onclick = () => {
            if (i===0) { weapons[0].damage += 5; weapons[0].count++; }
            else if (i===1) player.speed *= 1.25;
            else if (i===2) { player.maxHp += 30; player.hp += 30; }
            else weapons.push({name:"Frost Howl", damage:8, rate:1.1, lastFire:0, count:1});
            modal.style.display = 'none';
            gameRunning = true;
        };
        div.appendChild(el);
    });
    modal.style.display = 'block';
}

function restart() {
    enemies = []; projectiles = []; pickups = []; time = 0;
    initPlayer();
    gameRunning = true;
    document.getElementById('gameover').style.display = 'none';
    document.getElementById('levelup').style.display = 'none';
}

window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

loadCSV();
initPlayer();

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}
gameLoop();