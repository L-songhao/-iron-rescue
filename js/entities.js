// 实体: 素材管理(含皮肤换色) / 吉普(转向) / 子弹 / 手雷 / 建筑 / 战俘 / 敌人 / Boss
// 逻辑与渲染分离: update 只改数值, draw 只画画 (为以后联机留架构)。
const Assets = {
  imgs: {}, skinVariants: [], loaded: 0, total: 0, ready: false,
  load(onDone) {
    const defs = {
      'jeep-player': 1, 'jeep-enemy': 1, 'tank-enemy': 1, 'turret': 1, 'boss-tank': 1,
      'tree': 1, 'rock': 1, 'sandbag': 1, 'pow': 1, 'crate': 1,
      'bunker': 1, 'barracks': 1, 'depot': 1,
    };
    const names = Object.keys(defs);
    this.total = names.length;
    let done = 0;
    const finish = () => { if (++done === names.length) { this.ready = true; this._buildSkinVariants(); onDone(); } };
    for (const name of names) {
      const img = new Image();
      img.onload = () => { this.imgs[name] = Assets._keyOutWhite(img); finish(); };
      img.onerror = () => { this.imgs[name] = null; finish(); };
      img.src = (window.__ASSET_DATA && window.__ASSET_DATA[name]) || ('assets/' + name + '.png');
    }
  },
  // 白底抠除: 部分素材(如军营/碉堡/玩家吉普)背景为不透明白色, 加载时做一次
  // 边缘泛洪抠除(已带透明通道的素材不受影响)。运行时一次性成本, 绘制零成本。
  _keyOutWhite(img) {
    try {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) return img;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, w, h), px = d.data;
      const seen = new Uint8Array(w * h), stack = [];
      for (let x = 0; x < w; x++) { stack.push(x); stack.push(x + (h - 1) * w); }
      for (let y = 0; y < h; y++) { stack.push(y * w); stack.push(w - 1 + y * w); }
      while (stack.length) {
        const i = stack.pop();
        if (seen[i]) continue;
        seen[i] = 1;
        const o = i * 4;
        if (px[o] >= 240 && px[o + 1] >= 240 && px[o + 2] >= 240) {
          px[o + 3] = 0;
          const x = i % w, y = (i / w) | 0;
          if (x > 0) stack.push(i - 1);
          if (x < w - 1) stack.push(i + 1);
          if (y > 0) stack.push(i - w);
          if (y < h - 1) stack.push(i + w);
        }
      }
      g.putImageData(d, 0, 0);
      const out = new Image();
      out.src = c.toDataURL();
      return out;
    } catch (e) { return img; }
  },
  // 皮肤换色: 对俯视图同样用滤镜变体, 运行时零成本
  _buildSkinVariants() {
    this.skinVariants = CFG.skins.map(s => {
      const base = this.imgs['jeep-player'];
      if (!base || !base.complete) return base;
      if (s.filter === 'none') return base;
      const c = document.createElement('canvas');
      c.width = base.width; c.height = base.height;
      const g = c.getContext('2d');
      g.filter = s.filter;
      g.drawImage(base, 0, 0);
      const out = new Image();
      out.src = c.toDataURL();
      return out;
    });
  },
  get playerSkin() {
    const i = (typeof G !== 'undefined' && G.skinIdx) || 0;
    return this.skinVariants[i] || this.imgs['jeep-player'];
  }
};

// ---------- 粒子 / 飘字 ----------
class Particle {
  constructor(x, y, vx, vy, life, size, color, grav = 0) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life; this.size = size; this.color = color; this.grav = grav;
  }
  update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; this.vy += this.grav * dt; this.life -= dt; return this.life > 0; }
  draw(ctx) {
    ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    ctx.globalAlpha = 1;
  }
}
class FloatText {
  constructor(x, y, text, color = '#ffe14d', size = 22) {
    this.x = x; this.y = y; this.text = text; this.color = color; this.size = size; this.life = 1.1;
  }
  update(dt) { this.y -= 46 * dt; this.life -= dt; return this.life > 0; }
  draw(ctx) {
    ctx.globalAlpha = Math.min(1, this.life * 2);
    ctx.font = `bold ${this.size}px sans-serif`; ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 4;
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillStyle = this.color; ctx.fillText(this.text, this.x, this.y);
    ctx.globalAlpha = 1;
  }
}

// ---------- 玩家吉普: 车头转向移动方向 ----------
class Player {
  constructor(x, y) {
    const P = CFG.player;
    this.x = x; this.y = y;
    this.angle = -Math.PI / 2;   // 朝向(弧度, 0=东, -90°=北/上)
    this.speed = P.speed; this.turnRate = P.turn;
    this.hp = this.maxHp = P.hp; this.r = P.r;
    this.fireCd = 0; this.grenades = P.grenades;
    this.aboard = 0; this.aboardMax = P.aboardMax;
    this.weapon = 0;             // 0=机枪 1=三向散射
    this.grenadeLevel = 0;       // 投掷武器等级: 0手雷 1火箭筒 2远程导弹 3散射导弹
    this.rescueCount = 0;        // 累计救人(升级计数用)
    this.invuln = 0; this.hitCd = 0;
    this.moving = false;
    this._dustT = 0;
  }
  get img() { return Assets.playerSkin; }
  nose() { return { x: this.x + Math.cos(this.angle) * 38, y: this.y + Math.sin(this.angle) * 38 }; }

  update(dt, game) {
    const mv = Input.moveVec();
    if (mv) {
      // 转向: 朝移动方向转动(最短弧), 有转向速度限制 → 车感
      const ta = Math.atan2(mv.y, mv.x);
      let d = ta - this.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const mx = this.turnRate * dt;
      this.angle += Math.abs(d) < mx ? d : Math.sign(d) * mx;
      this.x += mv.x * this.speed * dt;
      this.y += mv.y * this.speed * dt;
      this.moving = true;
      this._dustT -= dt;
      if (this._dustT <= 0) { // 行驶扬尘
        this._dustT = 0.09;
        const bx = this.x - Math.cos(this.angle) * 26, by = this.y - Math.sin(this.angle) * 26;
        FX.puff(bx + (Math.random()-0.5)*14, by + (Math.random()-0.5)*14);
      }
    } else this.moving = false;
    // 世界边界
    this.x = Math.max(40, Math.min(CFG.world.w - 40, this.x));
    this.y = Math.max(40, Math.min(CFG.world.h - 40, this.y));

    // 手动机枪: 按住开火键
    this.fireCd -= dt;
    if (Input.fire && this.fireCd <= 0) { this.shoot(game); this.fireCd = 1 / CFG.player.mgRate; }
    // 投掷武器: L0手雷(耗弹药) / L1+火箭筒系(无限, 升级奖励)
    if (Input.consumeGrenade()) this.fireShell(game);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hitCd > 0) this.hitCd -= dt;
  }
  fireShell(game) {
    const W = CFG.weapons[this.grenadeLevel], n = this.nose();
    if (this.grenadeLevel === 0) {
      if (this.grenades <= 0) { SFX.denied(); return; }
      this.grenades--;
      game.grenades.push(new Grenade(this.x, this.y, this.angle, W.range));
    } else if (W.spread) {
      for (let i = -1; i <= 1; i++)
        game.grenades.push(new Shell(n.x, n.y, this.angle + i * 0.17, this.grenadeLevel));
    } else {
      game.grenades.push(new Shell(n.x, n.y, this.angle, this.grenadeLevel));
    }
    if (this.grenadeLevel > 0) SFX.rocket(); else SFX.throw_();
    FX.muzzle(n.x, n.y, this.angle);
  }
  upgradeWeapon(game) {
    if (this.grenadeLevel >= CFG.weapons.length - 1) {
      game.addScore(500, this.x, this.y - 30);
      game.floatTexts.push(new FloatText(this.x, this.y - 46, '武器已满级 +500', '#ffd94d', 20));
      return;
    }
    this.grenadeLevel++;
    const name = CFG.weapons[this.grenadeLevel].name;
    game.banner('武器升级：' + name + '！', 2.2);
    game.floatTexts.push(new FloatText(this.x, this.y - 44, '⬆ ' + name, '#ffd94d', 24));
    FX.sparkle(this.x, this.y);
    FX.screenFlash();
    SFX.upgrade();
  }
  shoot(game) {
    const n = this.nose(), dmg = CFG.player.mgDmg;
    const mk = (a) => game.pBullets.push(new Bullet(n.x, n.y, a, 950, dmg));
    if (this.weapon === 1) { mk(this.angle - 0.14); mk(this.angle); mk(this.angle + 0.14); }
    else mk(this.angle);
    SFX.shoot();
    FX.muzzle(n.x, n.y, this.angle);
  }
  hurt(dmg, game) {
    if (this.invuln > 0 || this.hitCd > 0 || game.state !== 'playing') return;
    this.hp -= dmg; this.hitCd = 0.4;
    SFX.hit();
    if (this.hp <= 0) { this.hp = 0; game.onPlayerDead(); }
  }
  draw(ctx) {
    if (this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0) return; // 受伤闪烁
    drawShadow(ctx, this.x, this.y, 30);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2); // 素材车头朝上
    const s = 64, img = this.img;
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, -s / 2, -s / 2, s, s);
    else Fallback.jeep(ctx, 64, '#4a5d23');
    ctx.restore();
  }
}

// ---------- 子弹 ----------
class Bullet {
  constructor(x, y, angle, speed, dmg) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    this.dmg = dmg; this.life = 1.1; this.r = 5;
  }
  update(dt, game) {
    this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt;
    if (this.life <= 0) return false;
    // 打建筑
    for (const b of game.buildings) {
      if (b.hp > 0 && Math.hypot(this.x - b.x, this.y - b.y) < b.r) {
        b.takeDamage(this.dmg, game, this.x, this.y); return false;
      }
    }
    // 打敌人
    for (const e of [...game.enemies]) {
      if (Math.hypot(this.x - e.x, this.y - e.y) < e.r + 4) {
        e.takeDamage(this.dmg, game, this.x, this.y); return false;
      }
    }
    if (game.boss && !game.boss.dead && Math.hypot(this.x - game.boss.x, this.y - game.boss.y) < game.boss.r) {
      game.boss.takeDamage(this.dmg, game, this.x, this.y); return false;
    }
    return true;
  }
  draw(ctx) {
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath(); ctx.arc(this.x, this.y, 4, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,160,40,.5)';
    ctx.beginPath(); ctx.arc(this.x, this.y, 8, 0, 7); ctx.fill();
  }
}
class EnemyBullet {
  constructor(x, y, angle, speed = 300, dmg = 10) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    this.dmg = dmg; this.life = 2.2; this.r = 6;
  }
  update(dt, game) {
    this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt;
    if (this.life <= 0) return false;
    const p = game.player;
    if (Math.hypot(this.x - p.x, this.y - p.y) < p.r) { p.hurt(this.dmg, game); return false; }
    return true;
  }
  draw(ctx) {
    ctx.fillStyle = '#ff5a4d';
    ctx.beginPath(); ctx.arc(this.x, this.y, 5, 0, 7); ctx.fill();
  }
}

// ---------- 手雷: 朝车头方向投掷 ----------
class Grenade {
  constructor(x, y, angle, range) {
    this.sx = x; this.sy = y; this.angle = angle; this.range = range;
    this.t = 0; this.flyT = 0.55; this.x = x; this.y = y;
  }
  update(dt, game) {
    this.t += dt;
    const k = Math.min(1, this.t / this.flyT);
    this.x = this.sx + Math.cos(this.angle) * this.range * k;
    this.y = this.sy + Math.sin(this.angle) * this.range * k;
    if (this.t >= this.flyT) { game.explode(this.x, this.y, 150, 130); return false; }
    return true;
  }
  draw(ctx) {
    const k = this.t / this.flyT, h = Math.sin(k * Math.PI) * 46; // 抛物线高度
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(this.x, this.y, 10, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2f3a24';
    ctx.beginPath(); ctx.arc(this.x, this.y - h, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#5a6b3f';
    ctx.beginPath(); ctx.arc(this.x - 2, this.y - h - 2, 4, 0, 7); ctx.fill();
  }
}

// ---------- 火箭筒/导弹: 直线高速飞行, 尾焰曳光, 撞击或到射程即炸 ----------
class Shell {
  constructor(x, y, angle, level) {
    const W = CFG.weapons[level];
    this.x = x; this.y = y; this.angle = angle; this.level = level;
    this.speed = W.speed; this.range = W.range;
    this.dmg = W.dmg; this.radius = W.radius; this.color = W.color;
    this.traveled = 0; this._trail = 0;
  }
  _boom(game) {
    const W = CFG.weapons[this.level];
    game.explode(this.x, this.y, this.radius, this.dmg, true);
    FX.addShake(W.shake);
    FX.hitStop(0.05);
  }
  update(dt, game) {
    const step = this.speed * dt;
    this.x += Math.cos(this.angle) * step;
    this.y += Math.sin(this.angle) * step;
    this.traveled += step;
    // 尾焰曳光
    this._trail -= dt;
    if (this._trail <= 0) {
      this._trail = 0.016;
      FX.spawn(this.x - Math.cos(this.angle) * 16, this.y - Math.sin(this.angle) * 16,
        (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 70, 0.22, 4, this.color, 0, 2);
    }
    if (this.traveled >= this.range) { this._boom(game); return false; }
    // 撞击提前引爆
    for (const b of game.buildings) {
      if (b.hp > 0 && Math.hypot(this.x - b.x, this.y - b.y) < b.r) { this._boom(game); return false; }
    }
    for (const e of [...game.enemies]) {
      if (Math.hypot(this.x - e.x, this.y - e.y) < e.r + 6) { this._boom(game); return false; }
    }
    if (game.boss && !game.boss.dead && Math.hypot(this.x - game.boss.x, this.y - game.boss.y) < game.boss.r) {
      this._boom(game); return false;
    }
    return true;
  }
  draw(ctx) {
    const bx = this.x - Math.cos(this.angle) * 16, by = this.y - Math.sin(this.angle) * 16;
    // 火焰
    ctx.fillStyle = 'rgba(255,180,80,.85)';
    ctx.beginPath(); ctx.arc(bx, by, 7 + Math.random() * 4, 0, 7); ctx.fill();
    // 弹体
    ctx.save();
    ctx.translate(this.x, this.y); ctx.rotate(this.angle);
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.roundRect(-14, -4, 26, 8, 4); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.roundRect(8, -4, 6, 8, 3); ctx.fill(); // 弹头
    ctx.restore();
  }
}

// ---------- 建筑: 打烂放出战俘 ----------
class Building {
  constructor(x, y, type, opts = {}) {
    this.x = x; this.y = y; this.type = type; // bunker | barracks | depot
    this.hp = { bunker: 70, barracks: 45, depot: 55 }[type];
    this.maxHp = this.hp;
    this.r = { bunker: 48, barracks: 54, depot: 58 }[type];
    this.powCount = { bunker: 2, barracks: 3, depot: 1 }[type];
    this.powerup = !!opts.powerup;   // 打烂掉武器升级(机枪散射)
    this.flashPow = !!opts.flashPow; // 打烂放出"闪烁战俘"(投掷武器升级)
    this.flash = 0;
    this.img = Assets.imgs[type];
  }
  takeDamage(dmg, game, hx, hy) {
    if (this.hp <= 0) return;
    this.hp -= dmg; this.flash = 0.09;
    FX.sparks(hx, hy, 4);
    if (this.hp <= 0) this.destroy(game);
  }
  destroy(game) {
    if (this._destroyed) return; // 幂等: 爆炸连锁可能重复触发
    this._destroyed = true;
    game.addScore(CFG.score.building, this.x, this.y);
    const big = this.type === 'depot';
    game.explode(this.x, this.y, big ? 190 : 140, big ? 160 : 90, true);
    // 放出战俘(闪烁建筑放出闪烁战俘)
    for (let i = 0; i < this.powCount; i++) {
      const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 30;
      game.pows.push(new POW(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d, { flashing: this.flashPow }));
    }
    if (this.powerup) game.pickups.push(new Pickup(this.x, this.y, 'weapon'));
    SFX.buildingDown();
  }
  draw(ctx) {
    const s = this.r * 2.1, img = this.img;
    drawShadow(ctx, this.x, this.y + 8, this.r);
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, this.x - s / 2, this.y - s / 2, s, s);
    else { ctx.fillStyle = '#7a6a55'; ctx.fillRect(this.x - s / 2, this.y - s / 2, s, s); }
    if (this.flash > 0) { // 受击闪白
      ctx.globalAlpha = Math.min(1, this.flash * 8);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (this.hp < this.maxHp * 0.5) { // 半血冒烟
      if (Math.random() < 0.25) FX.puff(this.x + (Math.random()-0.5)*30, this.y - 20);
    }
  }
}

// ---------- 战俘: 挥手 → 跑向吉普 → 上车(闪烁战俘给武器升级) ----------
class POW {
  constructor(x, y, opts = {}) {
    this.x = x; this.y = y;
    this.state = 'wave';   // wave | toJeep | aboard
    this.t = Math.random() * 10;
    this.flashing = !!opts.flashing; // 闪烁战俘: 上车即升级投掷武器
    this.img = Assets.imgs['pow'];
  }
  update(dt, game) {
    this.t += dt;
    const p = game.player;
    if (this.state === 'wave') {
      if (Math.hypot(p.x - this.x, p.y - this.y) < 130) this.state = 'toJeep';
    } else if (this.state === 'toJeep') {
      const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
      if (d < 38) {
        if (p.aboard < p.aboardMax) {
          this.state = 'aboard';
          p.aboard++;
          p.rescueCount++;
          game.addScore(CFG.score.pow, this.x, this.y - 20);
          game.floatTexts.push(new FloatText(this.x, this.y - 30, '战俘+1', '#7dff8a', 20));
          SFX.rescue();
          // 升级: 闪烁战俘直接升 / 每救满N人升1级
          if (this.flashing || p.rescueCount % CFG.rescuePerUpgrade === 0) p.upgradeWeapon(game);
        }
        // 车满了就继续跟着跑
      } else {
        const sp = 300;
        this.x += dx / d * sp * dt; this.y += dy / d * sp * dt;
      }
    }
    return this.state !== 'aboard';
  }
  draw(ctx) {
    if (this.state === 'aboard') return;
    const bob = Math.sin(this.t * 8) * 3;
    drawShadow(ctx, this.x, this.y, 10);
    const s = 30, img = this.img;
    ctx.save();
    if (this.flashing) { // 闪烁战俘: 金色光晕+闪烁, 一眼可辨
      ctx.shadowColor = '#ffd94d'; ctx.shadowBlur = 20;
      ctx.globalAlpha = 0.72 + 0.28 * Math.sin(this.t * 10);
    }
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, this.x - s / 2, this.y - s / 2 + bob * 0.4, s, s);
    else { ctx.fillStyle = '#c9a06a'; ctx.beginPath(); ctx.arc(this.x, this.y + bob * 0.4, 11, 0, 7); ctx.fill(); }
    ctx.restore();
    if (this.state === 'wave') { // 挥手提示
      ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
      const w = Math.sin(this.t * 6) > 0 ? '👋' : '✋';
      ctx.fillText(w, this.x + 16, this.y - 18 + bob);
    }
  }
}

// ---------- 敌人 ----------
class Enemy {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.type = type;
    const S = {
      soldier: { hp: 24,  r: 16, score: CFG.score.soldier, speed: 0,   fireCd: 2.6, dmg: 8  },
      scout:   { hp: 32,  r: 22, score: CFG.score.scout,   speed: 150, fireCd: 3.2, dmg: 8  },
      jeep:    { hp: 60,  r: 26, score: CFG.score.jeep,    speed: 110, fireCd: 2.8, dmg: 10 },
      turret:  { hp: 90,  r: 30, score: CFG.score.turret,  speed: 0,   fireCd: 2.2, dmg: 12 },
      tank:    { hp: 160, r: 36, score: CFG.score.tank,    speed: 55,  fireCd: 2.6, dmg: 14 },
      golden:  { hp: 20,  r: 20, score: CFG.score.golden,  speed: 200, fireCd: 99,  dmg: 0  },
    }[type];
    this.hp = this.maxHp = S.hp; this.r = S.r; this.score = S.score;
    this.speed = S.speed; this.dmg = S.dmg;
    this.fireT = 1 + Math.random() * S.fireCd; this.fireCd = S.fireCd;
    this.flash = 0; this.t = Math.random() * 10;
    this.img = Assets.imgs[{ soldier: 'pow', scout: 'jeep-enemy', jeep: 'jeep-enemy', turret: 'turret', tank: 'tank-enemy', golden: 'jeep-enemy' }[type]];
    this.wob = Math.random() * Math.PI * 2;
  }
  takeDamage(dmg, game, hx, hy) {
    this.hp -= dmg; this.flash = 0.09;
    FX.sparks(hx, hy, 5);
    game.floatTexts.push(new FloatText(hx, hy - 14, '-' + Math.round(dmg), '#fff', 17));
    if (this.hp <= 0) game.killEnemy(this);
    else SFX.hitEnemy();
  }
  update(dt, game) {
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    const p = game.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
    // 移动类敌人: 靠近玩家(保持一定距离)
    if (this.speed > 0 && d > 220) {
      const wob = this.type === 'golden' ? Math.sin(this.t * 3) * 0.6 : 0;
      const a = Math.atan2(dy, dx) + wob;
      this.x += Math.cos(a) * this.speed * dt;
      this.y += Math.sin(a) * this.speed * dt;
    }
    // 开火(新手期缓坡: 前60秒开火频率与伤害×0.7; Boss不受影响)
    this.fireT -= dt;
    if (this.fireT <= 0 && d < 620 && this.type !== 'golden') {
      const T = CFG.tuning, ramp = (game.time || 0) < T.rampTime ? T.rampMul : 1;
      this.fireT = this.fireCd * (0.8 + Math.random() * 0.4) / ramp;
      const a = Math.atan2(dy, dx);
      game.eBullets.push(new EnemyBullet(this.x, this.y, a, T.enemyBulletSpeed, Math.round(this.dmg * ramp)));
      SFX.enemyShoot();
    }
    // 接触伤害
    if (d < this.r + p.r) { p.hurt(this.type === 'tank' ? 16 : 8, game); }
  }
  draw(ctx) {
    const p = (typeof G !== 'undefined') ? G.player : null;
    drawShadow(ctx, this.x, this.y, this.r);
    const s = this.r * 2.2, img = this.img;
    ctx.save();
    if (this.type === 'golden') { // 金色隐藏怪
      ctx.shadowColor = '#ffd94d'; ctx.shadowBlur = 18;
      if (img && img.complete && img.naturalWidth) {
        ctx.globalAlpha = 0.92;
        ctx.drawImage(img, this.x - s / 2, this.y - s / 2, s, s);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,215,77,.35)';
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, 7); ctx.fill();
      }
      ctx.restore(); return;
    }
    if (this.type === 'soldier') { // 士兵: 小人 + 朝向玩家的枪线
      if (img && img.complete && img.naturalWidth) ctx.drawImage(img, this.x - s / 2, this.y - s / 2, s, s);
      else { ctx.fillStyle = '#a33'; ctx.beginPath(); ctx.arc(this.x, this.y, 12, 0, 7); ctx.fill(); }
    } else {
      if (img && img.complete && img.naturalWidth) ctx.drawImage(img, this.x - s / 2, this.y - s / 2, s, s);
      else Fallback.tank(ctx, s, '#6b3a2a');
      // 炮管朝向玩家(坦克/炮塔)
      if (p && (this.type === 'tank' || this.type === 'turret')) {
        const a = Math.atan2(p.y - this.y, p.x - this.x);
        ctx.strokeStyle = '#222'; ctx.lineWidth = 7; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(a) * (this.r + 16), this.y + Math.sin(a) * (this.r + 16)); ctx.stroke();
      }
    }
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(1, this.flash * 9);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

// ---------- Boss: 重型坦克 · 三阶段 ----------
// P1 常规(移动+单发炮击) → P2 狂暴(<66%: 加速+双发扇形) → P3 残血(<33%: 召唤小怪+冲撞)
class Boss {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.hp = this.maxHp = 1500; this.r = 62;
    this.dead = false; this.flash = 0;
    this.fireT = 2; this.t = 0; this.dir = 1;
    this.phase = 1;
    this.volley = 0; this.volleyT = 0;   // P2双发扇形
    this.minionT = 3; this.minionAlt = 0;// P3召唤
    this.dashT = 4; this.telegraph = 0; this.dashing = 0; this.dashDx = 0; this.dashDy = 0; // P3冲撞
    this.img = Assets.imgs['boss-tank'];
  }
  takeDamage(dmg, game, hx, hy) {
    if (this.dead) return;
    this.hp -= dmg; this.flash = 0.08;
    FX.sparks(hx, hy, 6);
    game.floatTexts.push(new FloatText(hx, hy - 16, '-' + Math.round(dmg), '#ffd94d', 19));
    if (this.hp <= 0) { game.killBoss(); return; }
    const k = this.hp / this.maxHp;
    if (this.phase === 1 && k < 0.66) this.enterPhase(2, game);
    else if (this.phase === 2 && k < 0.33) this.enterPhase(3, game);
    else SFX.hitEnemy();
  }
  enterPhase(n, game) {
    this.phase = n;
    game.banner(n === 2 ? '⚠ Boss 狂暴化！' : '⚠ Boss 残血暴走！', 2.2);
    FX.hitStop(0.3); FX.screenFlash(); FX.addShake(0.55);
    FX.explosion(this.x, this.y, 1.2);
    SFX.phaseShift();
    if (n === 3) { this.minionT = 1.5; this.dashT = 2.5; }
  }
  _aimed(game, dmg, speed) {
    const p = game.player, a = Math.atan2(p.y - this.y, p.x - this.x);
    game.eBullets.push(new EnemyBullet(this.x, this.y, a, speed, dmg));
    SFX.bossShoot();
  }
  _fan(game, n, spread, dmg, speed) {
    const p = game.player, a = Math.atan2(p.y - this.y, p.x - this.x);
    for (let i = 0; i < n; i++)
      game.eBullets.push(new EnemyBullet(this.x, this.y, a + (i - (n - 1) / 2) * spread, speed, dmg));
    SFX.bossShoot();
    FX.addShake(0.18);
  }
  _spawnMinion(game) {
    const alive = game.enemies.length;
    if (alive >= 5) return;
    const type = this.minionAlt % 2 === 0 ? 'scout' : 'jeep';
    this.minionAlt++;
    const a = Math.random() * Math.PI * 2;
    game.enemies.push(new Enemy(this.x + Math.cos(a) * 90, this.y + Math.sin(a) * 90, type));
    FX.sparkle(this.x, this.y);
    game.floatTexts.push(new FloatText(this.x, this.y - 70, '敌军增援!', '#ff8a7d', 20));
  }
  update(dt, game) {
    if (this.dead) return;
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    const p = game.player;

    // --- P3 冲撞: 预警 → 冲锋 ---
    if (this.phase === 3) {
      if (this.dashing > 0) {
        this.dashing -= dt;
        this.x += this.dashDx * 520 * dt; this.y += this.dashDy * 520 * dt;
        this.x = Math.max(80, Math.min(CFG.world.w - 80, this.x));
        this.y = Math.max(80, Math.min(CFG.world.h - 80, this.y));
        if (Math.random() < 0.5) FX.puff(this.x, this.y + 30);
        if (Math.hypot(p.x - this.x, p.y - this.y) < this.r + p.r) p.hurt(30, game);
        return;
      }
      if (this.telegraph > 0) {
        this.telegraph -= dt;
        this.flash = 0.05;
        if (this.telegraph <= 0) {
          const a = Math.atan2(p.y - this.y, p.x - this.x);
          this.dashDx = Math.cos(a); this.dashDy = Math.sin(a);
          this.dashing = 0.55;
          FX.addShake(0.4); SFX.bossShoot();
        }
        return;
      }
      this.dashT -= dt;
      if (this.dashT <= 0) { this.dashT = 5; this.telegraph = 0.7; FX.addShake(0.25); SFX.bossWarn(); }
      // P3 召唤小怪
      this.minionT -= dt;
      if (this.minionT <= 0) { this.minionT = 4.5; this._spawnMinion(game); }
    }

    // --- 移动(各阶段速度不同) ---
    const spd = this.phase === 2 ? 140 : this.phase === 3 ? 100 : 70;
    this.x += this.dir * spd * dt;
    if (this.x < 350) this.dir = 1;
    if (this.x > CFG.world.w - 350) this.dir = -1;

    // --- 开火 ---
    this.fireT -= dt;
    if (this.volley > 0) { // P2第二发扇形(延迟)
      this.volleyT -= dt;
      if (this.volleyT <= 0) { this.volley--; this.volleyT = 0.3; this._fan(game, 3, 0.2, 13, 340); }
    } else if (this.fireT <= 0) {
      if (this.phase === 1) { this.fireT = 1.5; this._aimed(game, 14, 340); }
      else if (this.phase === 2) { this.fireT = 1.3; this._fan(game, 3, 0.2, 13, 340); this.volley = 1; this.volleyT = 0.3; }
      else { this.fireT = 1.1; this._fan(game, 4, 0.18, 12, 360); }
    }
    if (Math.hypot(p.x - this.x, p.y - this.y) < this.r + p.r && this.dashing <= 0) p.hurt(25, game);
  }
  draw(ctx) {
    if (this.dead) return;
    drawShadow(ctx, this.x, this.y + 10, this.r);
    const s = this.r * 2.4, img = this.img;
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, this.x - s / 2, this.y - s / 2, s, s);
    else Fallback.tank(ctx, s, '#5a2d22');
    // 阶段光环: P2橙 / P3红(脉冲)
    if (this.phase > 1) {
      const pulse = 0.5 + 0.3 * Math.sin(this.t * (this.phase === 3 ? 10 : 5));
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = this.phase === 2 ? '#ff9a3c' : '#ff3b30';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 10, 0, 7); ctx.stroke();
      ctx.restore();
    }
    // 阶段点(头顶)
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < this.phase ? '#ff5a4d' : 'rgba(255,255,255,.25)';
      ctx.beginPath(); ctx.arc(this.x - 26 + i * 26, this.y - this.r - 22, 7, 0, 7); ctx.fill();
    }
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(1, this.flash * 10);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

// ---------- 补给 ----------
class Pickup {
  constructor(x, y, kind) { // kind: grenade | weapon
    this.x = x; this.y = y; this.kind = kind; this.t = Math.random() * 10;
    this.img = kind === 'grenade' ? Assets.imgs['crate'] : null;
  }
  update(dt, game) {
    this.t += dt;
    const p = game.player;
    if (Math.hypot(p.x - this.x, p.y - this.y) < p.r + 18) {
      if (this.kind === 'grenade') {
        p.grenades = Math.min(9, p.grenades + 2);
        game.floatTexts.push(new FloatText(this.x, this.y - 20, '手雷+2', '#7dff8a', 20));
      } else {
        p.weapon = 1;
        game.floatTexts.push(new FloatText(this.x, this.y - 20, '机枪升级: 散射!', '#ffd94d', 22));
      }
      SFX.pickup();
      return false;
    }
    return true;
  }
  draw(ctx) {
    const bob = Math.sin(this.t * 5) * 4, s = 44;
    ctx.save();
    ctx.shadowColor = this.kind === 'weapon' ? '#ffd94d' : '#7dff8a'; ctx.shadowBlur = 14;
    if (this.kind === 'grenade' && this.img && this.img.complete && this.img.naturalWidth)
      ctx.drawImage(this.img, this.x - s / 2, this.y - s / 2 + bob, s, s);
    else {
      ctx.fillStyle = this.kind === 'weapon' ? '#e67e22' : '#3f7a3f';
      ctx.beginPath(); ctx.arc(this.x, this.y + bob, 18, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(this.kind === 'weapon' ? 'W' : '+', this.x, this.y + bob + 7);
    }
    ctx.restore();
  }
}

// ---------- 阴影 / 兜底绘制 ----------
function drawShadow(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.42, r * 0.95, r * 0.42, 0, 0, 7); ctx.fill();
}
const Fallback = {
  jeep(ctx, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.roundRect(-s / 2, -s * 0.32, s, s * 0.64, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.beginPath(); ctx.roundRect(-s * 0.28, -s * 0.22, s * 0.5, s * 0.44, 6); ctx.fill();
  },
  tank(ctx, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.roundRect(-s / 2, -s * 0.36, s, s * 0.72, 10); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, 7); ctx.fill();
  },
};
