// 实体: 素材管理(含皮肤换色) / 玩家 / 子弹 / 手雷 / 敌人AI / 战俘 / 补给
// 逻辑与渲染分离: update 只改数值, draw 只画画 (为以后联机留架构)。
const Assets = {
  imgs: {}, skinVariants: [], loaded: 0, total: 0, ready: false,
  load(onDone) {
    const list = ['jeep-player','jeep-enemy','tank-enemy','turret','boss-tank',
                  'tree','rock','sandbag','pow','crate'];
    this.total = list.length;
    if (!list.length) { this.ready = true; onDone(); return; }
    list.forEach(name => {
      const img = new Image();
      img.onload = () => { this.imgs[name] = img; this._done(onDone); };
      img.onerror = () => { this._done(onDone); }; // 缺图用代码兜底绘制
      img.src = (window.__ASSET_DATA && window.__ASSET_DATA[name]) || ('assets/' + name + '.png');
    });
  },
  _done(onDone) {
    if (++this.loaded >= this.total) {
      this.ready = true;
      this._buildSkinVariants();
      onDone();
    }
  },
  // 皮肤换色: 加载时预渲染, 运行时零开销
  _buildSkinVariants() {
    const base = this.imgs['jeep-player'];
    this.skinVariants = CFG.skins.map(s => {
      if (!base || s.filter === 'none') return base || null;
      const c = document.createElement('canvas');
      c.width = base.width; c.height = base.height;
      const g = c.getContext('2d');
      g.filter = s.filter;
      g.drawImage(base, 0, 0);
      const out = new Image(); out.src = c.toDataURL();
      return out;
    });
  },
  get(name) { return this.imgs[name] || null; },
  playerSkin(i) { return this.skinVariants[i] || this.imgs['jeep-player'] || null; },
};

// ---------- 数学 ----------
const dist2 = (a, b) => { const dx = a.x-b.x, dy = a.y-b.y; return dx*dx + dy*dy; };
const dist = (a, b) => Math.hypot(a.x-b.x, a.y-b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angLerp = (a, b, t) => {
  let d = (b - a) % (Math.PI*2);
  if (d > Math.PI) d -= Math.PI*2; if (d < -Math.PI) d += Math.PI*2;
  return a + d * t;
};

// ---------- 3D感绘制: 投影 + 旋转精灵 (缺图时代码兜底) ----------
function drawShadow(ctx, x, y, r) {
  ctx.fillStyle = CFG.colors.shadow;
  ctx.beginPath();
  ctx.ellipse(x + r*0.18, y + r*0.42, r*0.95, r*0.5, 0, 0, Math.PI*2);
  ctx.fill();
}
function drawVehicle(ctx, img, x, y, angle, size, fallback) {
  drawShadow(ctx, x, y, size*0.5);
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  const s = size;
  if (img && img.complete && img.naturalWidth) {
    ctx.drawImage(img, -s/2, -s/2, s, s);
  } else fallback(ctx, s);
  ctx.restore();
}
// 受击闪白: 用 filter 提亮绘制
function drawFlashable(ctx, drawFn, flashing) {
  if (flashing) ctx.filter = 'brightness(2.6) saturate(0.4)';
  drawFn();
  ctx.filter = 'none';
}
const Fallback = {
  jeep(ctx, s, color) {
    ctx.fillStyle = color || '#4a7c3a';
    ctx.beginPath(); ctx.roundRect(-s/2, -s*0.32, s, s*0.64, 8); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.roundRect(-s*0.28, -s*0.22, s*0.5, s*0.44, 6); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(s*0.05, -s*0.06, s*0.4, s*0.12); // 炮管朝右(0弧度方向)
    ctx.beginPath(); ctx.arc(-s*0.05, 0, s*0.14, 0, Math.PI*2); ctx.fill();
  },
  tank(ctx, s, color) {
    ctx.fillStyle = color || '#5d6d7e';
    ctx.beginPath(); ctx.roundRect(-s/2, -s*0.36, s, s*0.72, 10); ctx.fill();
    ctx.fillStyle = '#2c3e50';
    ctx.beginPath(); ctx.arc(0, 0, s*0.2, 0, Math.PI*2); ctx.fill();
    ctx.fillRect(0, -s*0.05, s*0.48, s*0.1);
  },
};

// ---------- 子弹 ----------
class Bullet {
  constructor(x, y, angle, speed, dmg, enemy) {
    this.x=x; this.y=y; this.vx=Math.cos(angle)*speed; this.vy=Math.sin(angle)*speed;
    this.dmg=dmg; this.enemy=!!enemy; this.life=1.6; this.r = enemy?5:4;
  }
  update(dt) { this.x+=this.vx*dt; this.y+=this.vy*dt; this.life-=dt;
    return this.life>0 && this.x>-50 && this.y>-50 && this.x<CFG.world.w+50 && this.y<CFG.world.h+50; }
  draw(ctx) {
    ctx.fillStyle = this.enemy ? '#ff5a4a' : '#ffe28a';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,130,0.35)';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r*2.2, 0, Math.PI*2); ctx.fill();
  }
}
// ---------- 手雷: 抛向目标点, 落地范围爆炸 ----------
class Grenade {
  constructor(x, y, tx, ty) {
    this.x=x; this.y=y; this.sx=x; this.sy=y; this.tx=tx; this.ty=ty;
    this.t=0; this.dur=0.45; this.r=7;
  }
  update(dt) {
    this.t += dt;
    const k = Math.min(1, this.t / this.dur), e = 1 - Math.pow(1-k, 2);
    this.x = this.sx + (this.tx-this.sx)*e; this.y = this.sy + (this.ty-this.sy)*e;
    return k < 1;
  }
  draw(ctx) {
    const k = Math.min(1, this.t/this.dur), h = Math.sin(k*Math.PI)*46; // 抛物线高度
    drawShadow(ctx, this.x, this.y, 8);
    ctx.fillStyle = '#2d4a22';
    ctx.beginPath(); ctx.arc(this.x, this.y - h, this.r, 0, Math.PI*2); ctx.fill();
  }
}

// ---------- 玩家 ----------
class Player {
  constructor(x, y, skin) {
    const P = CFG.player;
    this.x=x; this.y=y; this.vx=0; this.vy=0; this.angle=0;
    this.hp=P.hp; this.maxHp=P.hp; this.r=P.radius;
    this.skin=skin||0; this.fireCd=0; this.grenades=P.grenades;
    this.hitCd=0; this.muzzleT=0; this.dead=false;
  }
  update(dt, game) {
    if (this.dead) return;
    const P = CFG.player;
    // 移动: 加速度+摩擦, 手感顺滑
    this.vx += Input.mx * P.accel * dt; this.vy += Input.my * P.accel * dt;
    const fr = Math.max(0, 1 - P.friction * dt);
    this.vx *= fr; this.vy *= fr;
    const sp = Math.hypot(this.vx, this.vy), max = P.speed;
    if (sp > max) { this.vx = this.vx/sp*max; this.vy = this.vy/sp*max; }
    this.x = clamp(this.x + this.vx*dt, 30, CFG.world.w-30);
    this.y = clamp(this.y + this.vy*dt, 30, CFG.world.h-30);
    if (sp > 40) this.angle = angLerp(this.angle, Math.atan2(this.vy, this.vx), Math.min(1, dt*10));

    // 自动索敌射击
    this.fireCd -= dt;
    const target = game.nearestEnemy(this.x, this.y, P.mgRange);
    if (target && this.fireCd <= 0) {
      this.fireCd = 1 / P.mgRate;
      const a = Math.atan2(target.y-this.y, target.x-this.x);
      const gx = this.x + Math.cos(a)*30, gy = this.y + Math.sin(a)*30;
      game.pBullets.push(new Bullet(gx, gy, a, P.mgSpeed, P.mgDamage, false));
      FX.muzzle(gx, gy, a); SFX.shoot();
      this.muzzleT = 0.06;
    }
    if (this.muzzleT > 0) this.muzzleT -= dt;

    // 手雷
    if (Input.grenade) {
      Input.grenade = false;
      if (this.grenades > 0) {
        this.grenades--;
        let tx = this.x + Math.cos(this.angle)*320, ty = this.y + Math.sin(this.angle)*320;
        const t2 = game.nearestEnemy(this.x, this.y, 560);
        if (t2) { tx = t2.x; ty = t2.y; }
        game.grenades.push(new Grenade(this.x, this.y, tx, ty));
        SFX.grenadeThrow();
      }
    }
    if (this.hitCd > 0) this.hitCd -= dt;
  }
  hurt(dmg, game) {
    if (this.dead || this.hitCd > 0) return;
    this.hitCd = 0.35; this.hp -= dmg;
    FX.addShake(CFG.feel.shakeOnPlayerHit); FX.screenFlash(); SFX.playerHit();
    FX.sparks(this.x, this.y, 8, '#ff6b5e');
    if (this.hp <= 0) { this.hp = 0; this.dead = true; game.onPlayerDead(); }
  }
  draw(ctx) {
    const img = Assets.playerSkin(this.skin);
    drawFlashable(ctx, () => {
      drawVehicle(ctx, img, this.x, this.y, this.angle, 64,
        (c,s) => Fallback.jeep(c, s, ['#4a7c3a','#c9a227','#2e5f8a'][this.skin]));
    }, this.hitCd > 0.2);
    if (this.muzzleT > 0) { // 枪口火光
      const gx = this.x + Math.cos(this.angle)*36, gy = this.y + Math.sin(this.angle)*36;
      ctx.fillStyle = 'rgba(255,220,120,0.9)';
      ctx.beginPath(); ctx.arc(gx, gy, 10+Math.random()*6, 0, Math.PI*2); ctx.fill();
    }
  }
}

// ---------- 敌人 ----------
class Enemy {
  constructor(type, x, y) {
    const C = CFG.enemies[type] || CFG.goldenScout;
    this.type=type; this.x=x; this.y=y; this.vx=0; this.vy=0;
    this.hp=C.hp; this.maxHp=C.hp; this.r=C.radius; this.speed=C.speed;
    this.dmg = C.mgDamage || C.shellDamage; this.rate = C.mgRate || C.shellRate;
    this.range = C.mgRange || C.shellRange; this.bSpeed = C.mgSpeed || C.shellSpeed;
    this.score = C.score; this.color = C.color;
    this.fireCd = 1 + Math.random()*2; this.flash=0; this.angle=Math.random()*Math.PI*2;
    this.hitCd=0; this.isShell = (type==='tank'||type==='boss');
    this.wob = Math.random()*10;
  }
  takeDamage(dmg, game, hx, hy) {
    this.hp -= dmg; this.flash = CFG.feel.flashTime;
    FX.damageNumber(this.x, this.y, dmg, '#ffe28a');
    FX.sparks(hx, hy, 5);
    SFX.hit();
    if (this.hp <= 0) { game.killEnemy(this); return true; }
    return false;
  }
  // 简单分离, 防止叠罗汉
  separate(others, dt) {
    for (const o of others) {
      if (o === this) continue;
      const dx=this.x-o.x, dy=this.y-o.y, d=Math.hypot(dx,dy), min=this.r+o.r;
      if (d>0 && d<min) { const push=(min-d)*3*dt; this.x+=dx/d*push; this.y+=dy/d*push; }
    }
  }
  update(dt, game) {
    const p = game.player;
    if (this.flash>0) this.flash-=dt; if (this.hitCd>0) this.hitCd-=dt;
    const d = dist(this, p);
    let mvx=0, mvy=0;

    if (this.type==='scout' || this.type==='golden') {
      if (d < 750) { const a=Math.atan2(p.y-this.y,p.x-this.x);
        if (d > 300) { mvx=Math.cos(a); mvy=Math.sin(a); }
        else { mvx=Math.cos(a+Math.PI/2)*0.7; mvy=Math.sin(a+Math.PI/2)*0.7; } // 环绕
        this.angle = angLerp(this.angle, a, Math.min(1,dt*5));
      }
    } else if (this.type==='tank' || this.type==='boss') {
      if (d < 800 && d > 420) { const a=Math.atan2(p.y-this.y,p.x-this.x); mvx=Math.cos(a); mvy=Math.sin(a); }
      if (d < 700) this.angle = angLerp(this.angle, Math.atan2(p.y-this.y,p.x-this.x), Math.min(1,dt*3));
    } else if (this.type==='turret') {
      if (d < this.range) this.angle = angLerp(this.angle, Math.atan2(p.y-this.y,p.x-this.x), Math.min(1,dt*4));
    }
    this.x += mvx*this.speed*dt; this.y += mvy*this.speed*dt;
    this.x = clamp(this.x, 30, CFG.world.w-30); this.y = clamp(this.y, 30, CFG.world.h-30);
    this.separate(game.enemies, dt);

    // 开火
    this.fireCd -= dt;
    if (this.fireCd<=0 && d < this.range && !p.dead) {
      const a = Math.atan2(p.y-this.y, p.x-this.x);
      if (this.type==='boss') { // Boss: 扇形三连发
        for (const off of [-0.18, 0, 0.18])
          game.eBullets.push(new Bullet(this.x, this.y, a+off, this.bSpeed, this.dmg, true));
        this.fireCd = 1/this.rate;
      } else {
        game.eBullets.push(new Bullet(this.x, this.y, a+(Math.random()-0.5)*0.1, this.bSpeed, this.dmg, true));
        this.fireCd = 1/this.rate;
      }
      SFX.enemyShoot();
    }
    // 接触伤害
    if (d < this.r + p.r && this.hitCd<=0 && !p.dead) { this.hitCd=0.8; p.hurt(8, game); }
  }
  draw(ctx) {
    const spr = { scout:'jeep-enemy', golden:'jeep-enemy', tank:'tank-enemy', turret:'turret', boss:'boss-tank' }[this.type];
    const img = Assets.get(spr);
    const size = this.r*2.4;
    drawFlashable(ctx, () => {
      if (this.type==='golden' && img) { // 金色怪: 金色滤镜
        ctx.save(); ctx.filter='sepia(1) saturate(3) hue-rotate(-15deg)';
        drawVehicle(ctx, img, this.x, this.y, this.angle, size, (c,s)=>Fallback.jeep(c,s,this.color));
        ctx.restore();
      } else if (this.type==='turret') {
        drawShadow(ctx, this.x, this.y, this.r);
        if (img && img.complete && img.naturalWidth) { ctx.drawImage(img, this.x-size/2, this.y-size/2, size, size); }
        else { ctx.fillStyle=this.color; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill(); }
        ctx.save(); ctx.translate(this.x,this.y); ctx.rotate(this.angle);
        ctx.fillStyle='#333'; ctx.fillRect(0,-4,this.r+14,8); ctx.restore();
      } else {
        const fb = this.type==='tank'||this.type==='boss'
          ? (c,s)=>Fallback.tank(c,s,this.color) : (c,s)=>Fallback.jeep(c,s,this.color);
        drawVehicle(ctx, img, this.x, this.y, this.angle, size, fb);
      }
    }, this.flash>0);
    // 血条 (受伤才显示)
    if (this.hp < this.maxHp) {
      const w = this.r*2, k = Math.max(0, this.hp/this.maxHp);
      ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(this.x-w/2, this.y-this.r-12, w, 5);
      ctx.fillStyle = k>0.5?'#6f6':'#f66'; ctx.fillRect(this.x-w/2, this.y-this.r-12, w*k, 5);
    }
  }
}

// ---------- 战俘 ----------
class POW {
  constructor(x, y) { this.x=x; this.y=y; this.rescued=false; this.bob=Math.random()*10; }
  update(dt, game) {
    this.bob += dt*3;
    if (!this.rescued && dist(this, game.player) < CFG.pow.rescueRadius) {
      this.rescued = true;
      FX.sparkle(this.x, this.y); SFX.rescue();
      game.onRescue(this);
    }
  }
  draw(ctx) {
    if (this.rescued) return;
    const img = Assets.get('pow'), s=44, yo = Math.sin(this.bob)*4;
    drawShadow(ctx, this.x, this.y, 12);
    // 感叹号提示
    ctx.fillStyle='#ffeb3b'; ctx.font='bold 22px sans-serif'; ctx.textAlign='center';
    ctx.fillText('!', this.x, this.y - 34 + yo*0.5);
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, this.x-s/2, this.y-s/2+yo, s, s);
    else { ctx.fillStyle='#d9c27a'; ctx.beginPath(); ctx.arc(this.x, this.y+yo, 12, 0, Math.PI*2); ctx.fill(); }
  }
}
// ---------- 补给箱 ----------
class Pickup {
  constructor(x, y, kind) { this.x=x; this.y=y; this.kind=kind; this.bob=Math.random()*10; this.life=25; }
  update(dt, game) {
    this.bob+=dt*3; this.life-=dt;
    if (this.life<=0) return false;
    if (dist(this, game.player) < 50) {
      if (this.kind==='grenade') game.player.grenades = Math.min(CFG.player.grenadeMax, game.player.grenades+2);
      if (this.kind==='medkit') game.player.hp = Math.min(game.player.maxHp, game.player.hp+30);
      SFX.pickup(); FX.sparkle(this.x, this.y);
      game.addScore(50, this.x, this.y);
      return false;
    }
    return true;
  }
  draw(ctx) {
    const img = Assets.get('crate'), s=40, yo=Math.sin(this.bob)*3;
    drawShadow(ctx, this.x, this.y, 12);
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, this.x-s/2, this.y-s/2+yo, s, s);
    else { ctx.fillStyle = this.kind==='medkit'?'#e74c3c':'#27ae60';
      ctx.fillRect(this.x-14, this.y-14+yo, 28, 28); }
  }
}
