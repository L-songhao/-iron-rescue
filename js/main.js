// 主循环: 状态机(标题/游玩/胜利/失败) / 镜头 / 碰撞 / HUD / 存档
// 存档抽象: 浏览器用 localStorage, 微信小游戏移植时换 wx.setStorageSync。
const Store = {
  key: 'ironrescue_save_v2',
  data: { high: 0, unlocked: [0], skin: 0 },
  load() { try { const s = localStorage.getItem(this.key); if (s) this.data = Object.assign(this.data, JSON.parse(s)); } catch (e) {} },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) {} },
};

const G = {
  state: 'loading', vw: 0, vh: 0, dpr: 1,
  player: null, enemies: [], buildings: [], pows: [], pickups: [],
  pBullets: [], eBullets: [], grenades: [], particles: [], floatTexts: [],
  boss: null, bossSpawned: false,
  score: 0, time: 0, cam: { x: 0, y: 0, w: 0, h: 0 },
  skinIdx: 0, bannerT: 0, bannerMsg: '', shakeT: 0,
  last: 0, ctx: null, canvas: null,

  init() {
    const canvas = document.getElementById('game');
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    const bm = document.getElementById('bootmsg');
    if (bm) bm.style.display = 'none';
    Store.load();
    this.skinIdx = Store.data.skin || 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    Input.init(canvas);
    FX.init();
    Assets.load(() => { this.state = 'title'; });
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  },
  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.vw = window.innerWidth; this.vh = window.innerHeight;
    this.canvas.width = this.vw * this.dpr; this.canvas.height = this.vh * this.dpr;
    this.canvas.style.width = this.vw + 'px'; this.canvas.style.height = this.vh + 'px';
    // 逻辑分辨率: 以高度为基准
    this._scale = this.vh / 800;
    this.vw = this.vw / this._scale; this.vh = 800;
    // 触屏按钮位置(逻辑坐标)
    Input._fireBtn = { x: this.vw - 96, y: this.vh - 108, r: 54 };
    Input._grenadeBtn = { x: this.vw - 208, y: this.vh - 84, r: 40 };
  },

  startGame() {
    this.player = new Player(CFG.world.w / 2, CFG.world.h - 320);
    this.enemies = []; this.buildings = []; this.pows = []; this.pickups = [];
    this.pBullets = []; this.eBullets = []; this.grenades = [];
    this.particles = []; this.floatTexts = [];
    this.score = 0; this.time = 0; this.boss = null; this.bossSpawned = false;
    Level.build(this);
    Input.reset();
    FX.freeze = 0; FX.trauma = 0; FX.flashT = 0; // 重置特效状态
    SFX.init(); SFX.start();
    this.state = 'playing';
    this.banner('深入敌后 — 摧毁建筑, 营救战俘!', 2.6);
  },

  addScore(n, x, y) {
    this.score += n;
    if (x !== undefined) this.floatTexts.push(new FloatText(x, y, '+' + n, '#ffe14d', 20));
    if (this.score > Store.data.high) { Store.data.high = this.score; Store.save(); }
  },
  banner(msg, dur = 2) { this.bannerMsg = msg; this.bannerT = dur; },

  explode(x, y, radius, dmg, big = false) {
    FX.explosion(x, y, big ? 1.5 : 1);
    SFX.explosion(big);
    const hit = (list, isPlayer) => {
      for (const e of [...list]) {
        if (Math.hypot(e.x - x, e.y - y) < radius + (e.r || 20)) {
          if (isPlayer) e.hurt(dmg, this);
          else e.takeDamage(dmg, this, e.x, e.y);
        }
      }
    };
    hit(this.enemies, false);
    hit(this.buildings, false);
    if (this.boss && !this.boss.dead && Math.hypot(this.boss.x - x, this.boss.y - y) < radius + this.boss.r)
      this.boss.takeDamage(dmg, this, this.boss.x, this.boss.y);
    const p = this.player;
    if (Math.hypot(p.x - x, p.y - y) < radius * 0.6) p.hurt(Math.round(dmg * 0.4), this);
  },
  killEnemy(e) {
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
    this.addScore(e.score, e.x, e.y - 20);
    FX.explosion(e.x, e.y, e.type === 'tank' ? 1.2 : 0.8);
    SFX.enemyDown();
    if (e.type === 'golden') {
      this.banner('发现隐藏金色侦察兵! +500', 1.6);
      FX.sparks(e.x, e.y, 22, '#ffd94d');
    }
  },
  killBoss() {
    const b = this.boss;
    b.dead = true;
    // 连环爆炸
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * b.r;
      FX.explosion(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, 1.3);
    }
    FX.hitStop(0.35); FX.addShake(0.55); FX.screenFlash();
    SFX.bossDown();
    this.addScore(CFG.score.boss, b.x, b.y - 60);
    this.banner('Boss 击毁!', 2);
  },
  onPlayerDead() {
    FX.explosion(this.player.x, this.player.y, 1.6);
    SFX.playerDown();
    FX.addShake(0.5); FX.hitStop(0.3);
    setTimeout(() => { this.state = 'lose'; }, 1300);
  },
  onWin() {
    this.addScore(CFG.score.winBonus);
    this.state = 'win';
    SFX.win();
    // 解锁皮肤积分判定
    Store.save();
  },
  tryUnlock(i) {
    const s = CFG.skins[i];
    if (Store.data.unlocked.includes(i)) { this.skinIdx = i; Store.data.skin = i; Store.save(); return true; }
    if (Store.data.high >= s.price) {
      Store.data.unlocked.push(i); this.skinIdx = i; Store.data.skin = i; Store.save();
      return true;
    }
    return false;
  },

  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    let dt = Math.min(0.05, (t - this.last) / 1000 || 0.016);
    this.last = t;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.state === 'playing') {
      this.update(dt);
    } else {
      dt = FX.update(dt);
      if (this.state === 'title') this.renderTitle(ctx);
      else if (this.state === 'win' || this.state === 'lose') this.renderEnd(ctx);
      // loading: 保持黑屏(bootmsg已处理)
      let tap;
      while ((tap = Input.consumeTap())) this.onTap(tap);
      return;
    }
    this.render(ctx);
    let tap;
    while ((tap = Input.consumeTap())) this.onTap(tap);
  },

  onTap(p) {
    if (this.state === 'title') {
      // 开始按钮
      const bw = 300, bh = 76, bx = this.vw / 2 - bw / 2, by = this.vh * 0.68;
      if (p.x >= bx && p.x <= bx + bw && p.y >= by && p.y <= by + bh) { this.startGame(); return; }
      // 皮肤选择: 三个色块
      for (let i = 0; i < 3; i++) {
        const sx = this.vw / 2 + (i - 1) * 150, sy = this.vh * 0.52;
        if (Math.hypot(p.x - sx, p.y - sy) < 52) {
          if (this.tryUnlock(i)) SFX.pickup(); else { this.banner('积分不足 (' + Store.data.high + '/' + CFG.skins[i].price + ')', 1.6); SFX.denied(); }
          return;
        }
      }
    } else if (this.state === 'win' || this.state === 'lose') {
      this.state = 'title';
    }
  },

  update(dt) {
    dt = FX.update(dt);
    if (dt === 0) return; // 顿帧: 跳过本帧逻辑
    this.time += dt;
    const p = this.player;
    p.update(dt, this);
    for (const e of [...this.enemies]) e.update(dt, this);
    if (this.boss) this.boss.update(dt, this);
    for (const b of this.buildings) if (b.flash > 0) b.flash -= dt;
    this.pows = this.pows.filter(w => w.update(dt, this));
    this.pickups = this.pickups.filter(k => k.update(dt, this));
    this.pBullets = this.pBullets.filter(b => b.update(dt, this));
    this.eBullets = this.eBullets.filter(b => b.update(dt, this));
    this.grenades = this.grenades.filter(g => g.update(dt, this));
    this.floatTexts = this.floatTexts.filter(t => t.update(dt));
    Level.update(this, dt);
    // 镜头跟随
    const vw = this.vw, vh = this.vh;
    this.cam.w = vw; this.cam.h = vh;
    this.cam.x = Math.max(0, Math.min(CFG.world.w - vw, p.x - vw / 2));
    this.cam.y = Math.max(0, Math.min(CFG.world.h - vh, p.y - vh * 0.58));
    if (this.bannerT > 0) this.bannerT -= dt;
  },

  // ---------- 渲染 ----------
  render(ctx) {
    const s = this._scale;
    ctx.save();
    ctx.scale(s, s);
    const sh = FX.shakeOffset();
    ctx.translate(sh.x, sh.y);
    const cam = this.cam;
    ctx.translate(-cam.x, -cam.y);
    Level.drawGround(ctx);
    Level.drawDecor(ctx, cam);
    for (const b of this.buildings) if (b.hp > 0) b.draw(ctx);
    for (const k of this.pickups) k.draw(ctx);
    for (const w of this.pows) w.draw(ctx);
    for (const e of this.enemies) e.draw(ctx);
    if (this.boss) this.boss.draw(ctx);
    if (this.state === 'playing' || this.state === 'lose') this.player.draw(ctx);
    for (const b of this.pBullets) b.draw(ctx);
    for (const b of this.eBullets) b.draw(ctx);
    for (const g of this.grenades) g.draw(ctx);
    FX.draw(ctx); // 粒子池 / 伤害数字 / 屏幕闪光(世界坐标)
    for (const t of this.floatTexts) t.draw(ctx);
    // Boss血条(世界坐标转屏幕)
    if (this.boss && !this.boss.dead && this.bossSpawned) this.renderBossBar(ctx);
    ctx.restore();
    // HUD / 按钮(屏幕坐标)
    ctx.save(); ctx.scale(s, s);
    this.renderHUD(ctx);
    this.renderTouchUI(ctx);
    if (this.bannerT > 0) {
      ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      const tw = ctx.measureText(this.bannerMsg).width;
      ctx.fillRect(this.vw / 2 - tw / 2 - 18, 108, tw + 36, 52);
      ctx.fillStyle = '#ffe14d';
      ctx.fillText(this.bannerMsg, this.vw / 2, 144);
    }
    ctx.restore();
    if (this.state === 'lose') { /* 延迟切结算屏 */ }
  },

  renderHUD(ctx) {
    const p = this.player;
    // 血条
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.beginPath(); ctx.roundRect(16, 14, 220, 26, 13); ctx.fill();
    const k = p.hp / p.maxHp;
    ctx.fillStyle = k > 0.5 ? '#6fdc5f' : k > 0.25 ? '#ffbe4d' : '#ff5a4d';
    if (k > 0) { ctx.beginPath(); ctx.roundRect(16, 14, 220 * k, 26, 13); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('✚ ' + Math.ceil(p.hp), 244, 34);
    // 战俘 / 手雷 / 分数
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#7dff8a';
    ctx.fillText('战俘 ' + p.aboard + '/' + p.aboardMax, 16, 68);
    ctx.fillStyle = '#ffd94d';
    ctx.fillText('💣×' + p.grenades, 16, 98);
    ctx.textAlign = 'right'; ctx.fillStyle = '#fff';
    ctx.fillText(this.score + ' 分', this.vw - 16, 36);
    ctx.font = '18px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillText('最高 ' + Store.data.high, this.vw - 16, 62);
    ctx.textAlign = 'left';
  },

  renderBossBar(ctx) {
    const b = this.boss, w = Math.min(560, this.vw - 80), x = (this.vw - w) / 2, y = this.vh - 36;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.beginPath(); ctx.roundRect(x, y, w, 18, 9); ctx.fill();
    ctx.fillStyle = '#c0392b';
    const k = Math.max(0, b.hp / b.maxHp);
    if (k > 0) { ctx.beginPath(); ctx.roundRect(x, y, w * k, 18, 9); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('重型坦克', this.vw / 2, y - 6);
    ctx.textAlign = 'left';
  },

  renderTouchUI(ctx) {
    // 开火键
    const f = Input._fireBtn;
    ctx.globalAlpha = Input.fire ? 0.85 : 0.55;
    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('开火', f.x, f.y + 9);
    // 手雷键
    const gr = Input._grenadeBtn, p = this.player;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = p.grenades > 0 ? '#e67e22' : '#555';
    ctx.beginPath(); ctx.arc(gr.x, gr.y, gr.r, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif';
    ctx.fillText('💣', gr.x, gr.y + 2);
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('×' + p.grenades, gr.x, gr.y + 26);
    // 摇杆
    const j = Input.joy;
    if (j.active) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(j.ox, j.oy, 62, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#ddd';
      ctx.beginPath(); ctx.arc(j.ox + j.dx * 62, j.oy + j.dy * 62, 28, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
  },

  renderTitle(ctx) {
    const s = this._scale;
    ctx.save(); ctx.scale(s, s);
    // 背景: 战地迷彩渐变
    const grd = ctx.createLinearGradient(0, 0, 0, this.vh);
    grd.addColorStop(0, '#2e3d22'); grd.addColorStop(1, '#1a2415');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.fillStyle = 'rgba(255,255,255,.04)';
    for (let i = 0; i < 24; i++) {
      const x = (i * 197) % this.vw, y = (i * 131) % this.vh;
      ctx.beginPath(); ctx.ellipse(x, y, 60, 30, 0.5, 0, 7); ctx.fill();
    }
    // 吉普展示(车头朝上)
    const jeep = Assets.playerSkin;
    if (jeep && jeep.complete && jeep.naturalWidth) {
      ctx.save();
      ctx.translate(this.vw / 2, this.vh * 0.24);
      ctx.drawImage(jeep, -70, -70, 140, 140);
      ctx.restore();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe14d';
    ctx.font = 'bold 64px sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 8;
    ctx.strokeText('铁甲营救', this.vw / 2, this.vh * 0.24 + 120);
    ctx.fillText('铁甲营救', this.vw / 2, this.vh * 0.24 + 120);
    ctx.fillStyle = '#fff'; ctx.font = '22px sans-serif';
    ctx.fillText('深入敌后 · 炸毁建筑 · 营救战俘', this.vw / 2, this.vh * 0.24 + 156);
    // 皮肤三选一
    ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif';
    ctx.fillText('— 选择战车 —', this.vw / 2, this.vh * 0.44);
    for (let i = 0; i < 3; i++) {
      const sk = CFG.skins[i], sx = this.vw / 2 + (i - 1) * 150, sy = this.vh * 0.52;
      const unlocked = Store.data.unlocked.includes(i);
      ctx.save();
      if (i === this.skinIdx) {
        ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(sx, sy, 52, 0, 7); ctx.stroke();
      }
      const img = Assets.skinVariants[i];
      ctx.globalAlpha = unlocked ? 1 : 0.45;
      if (img && img.complete && img.naturalWidth) ctx.drawImage(img, sx - 42, sx * 0 + sy - 42, 84, 84);
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.fillStyle = unlocked ? '#fff' : '#999'; ctx.font = '18px sans-serif';
      ctx.fillText(sk.name + (unlocked ? '' : ' 🔒' + sk.price), sx, sy + 74);
    }
    // 开始按钮
    const bw = 300, bh = 76, bx = this.vw / 2 - bw / 2, by = this.vh * 0.68;
    const pulse = 1 + Math.sin(performance.now() / 400) * 0.03;
    ctx.save();
    ctx.translate(this.vw / 2, by + bh / 2); ctx.scale(pulse, pulse); ctx.translate(-this.vw / 2, -(by + bh / 2));
    ctx.fillStyle = '#e67e22';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 34px sans-serif';
    ctx.fillText('开始行动', this.vw / 2, by + 50);
    ctx.restore();
    // 操作说明
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '19px sans-serif';
    ctx.fillText('左摇杆移动(车头转向) · 右键开火 · 橙键手雷', this.vw / 2, this.vh * 0.68 + 112);
    ctx.fillText('电脑: WASD移动 · 空格开火 · Q手雷', this.vw / 2, this.vh * 0.68 + 140);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = '17px sans-serif';
    ctx.fillText('最高分: ' + Store.data.high, this.vw / 2, this.vh - 30);
    ctx.restore();
  },

  renderEnd(ctx) {
    const s = this._scale;
    ctx.save(); ctx.scale(s, s);
    ctx.fillStyle = this.state === 'win' ? 'rgba(20,40,20,.88)' : 'rgba(40,20,20,.88)';
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.textAlign = 'center';
    ctx.fillStyle = this.state === 'win' ? '#7dff8a' : '#ff6b5e';
    ctx.font = 'bold 58px sans-serif';
    ctx.fillText(this.state === 'win' ? '任务完成!' : '吉普被击毁', this.vw / 2, this.vh * 0.36);
    ctx.fillStyle = '#fff'; ctx.font = '26px sans-serif';
    ctx.fillText('本局得分: ' + this.score, this.vw / 2, this.vh * 0.46);
    ctx.fillText('营救战俘: ' + this.player.aboard + ' 名', this.vw / 2, this.vh * 0.52);
    ctx.fillText('历史最高: ' + Store.data.high, this.vw / 2, this.vh * 0.58);
    ctx.fillStyle = '#e67e22';
    const bw = 260, bh = 64, bx = this.vw / 2 - bw / 2, by = this.vh * 0.66;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 12); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 28px sans-serif';
    ctx.fillText('返回标题', this.vw / 2, by + 42);
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '18px sans-serif';
    ctx.fillText('点击任意处返回', this.vw / 2, by + 100);
    ctx.restore();
  },
};

window.addEventListener('load', () => G.init());
