// 主循环: 状态机(标题/游玩/胜利/失败) / 镜头 / 碰撞 / HUD / 存档
// 存档抽象: 浏览器用 localStorage, 微信小游戏移植时换 wx.setStorageSync。
const Store = {
  key: 'ironrescue_save_v1',
  data: { high: 0, unlocked: [0], skin: 0 },
  load() {
    try {
      const s = localStorage.getItem(this.key);
      if (s) Object.assign(this.data, JSON.parse(s));
    } catch (e) {}
    // 积分解锁检查
    for (const sk of CFG.skins)
      if (this.data.high >= sk.unlock && !this.data.unlocked.includes(sk.id))
        this.data.unlocked.push(sk.id);
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) {} },
};

const G = {
  state: 'loading', // loading|title|playing|win|lose|paused
  player: null, enemies: [], pBullets: [], eBullets: [], grenades: [], pickups: [],
  cam: { x: 0, y: 0 }, score: 0, rescuedCount: 0, wave: 0,
  bossSpawned: false, boss: null, bossDead: false,
  bannerText: '', bannerSub: '', bannerT: 0,
  time: 0, vw: 0, vh: 0, dpr: 1,

  init() {
    const canvas = document.getElementById('game');
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    const bm = document.getElementById('bootmsg');
    if (bm) bm.style.display = 'none'; // 启动成功, 撤掉启动提示
    this.resize();
    window.addEventListener('resize', () => this.resize());
    Input.init(canvas);
    Input._grenadeBtn = { x: 0, y: 0, r: 52 };
    FX.init(); Store.load();
    Assets.load(() => { this.state = 'title'; });
    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
  },
  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.vw = window.innerWidth; this.vh = window.innerHeight;
    this.canvas.width = this.vw * this.dpr; this.canvas.height = this.vh * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    Input._grenadeBtn.x = this.vw - 84; Input._grenadeBtn.y = this.vh - 110;
  },

  startGame() {
    SFX.init(); SFX.resume();
    this.player = new Player(300, CFG.world.h - 300, Store.data.skin);
    this.enemies = []; this.pBullets = []; this.eBullets = [];
    this.grenades = []; this.pickups = [];
    this.score = 0; this.rescuedCount = 0; this.bossDead = false; this.boss = null;
    Level.build(this);
    this.state = 'playing';
    this.banner('营救行动开始', '救出 5 名战俘，摧毁敌方要塞！');
  },

  banner(t, sub) { this.bannerText = t; this.bannerSub = sub || ''; this.bannerT = 3; },
  addScore(n, x, y) {
    this.score += n;
    if (x !== undefined) FX.damageNumber(x, y, '+' + n, '#9fff9f');
  },
  nearestEnemy(x, y, range) {
    let best = null, bd = range * range;
    for (const e of this.enemies) { const d = dist2({x,y}, e); if (d < bd) { bd = d; best = e; } }
    return best;
  },
  killEnemy(e) {
    this.addScore(e.score, e.x, e.y);
    const big = e.type === 'boss' || e.type === 'tank';
    FX.explosion(e.x, e.y, e.type==='boss' ? 2.2 : big ? 1.3 : 0.9);
    FX.hitStop(big ? CFG.feel.hitStopBig : CFG.feel.hitStopSmall);
    if (e.type === 'boss') { this.bossDead = true; this.banner('Boss 被击毁！', ''); }
    // 掉落: 30%手雷 / 15%医疗
    const r = Math.random();
    if (r < 0.3) this.pickups.push(new Pickup(e.x, e.y, 'grenade'));
    else if (r < 0.42) this.pickups.push(new Pickup(e.x, e.y, 'medkit'));
    this.enemies.splice(this.enemies.indexOf(e), 1);
  },
  onRescue(pow) {
    this.rescuedCount++;
    this.addScore(CFG.score.powRescue, pow.x, pow.y);
    this.banner('战俘获救 ' + this.rescuedCount + '/' + CFG.pow.count, this.rescuedCount >= 3 ? '继续战斗！' : '');
  },
  onPlayerDead() {
    SFX.lose(); FX.explosion(this.player.x, this.player.y, 1.6);
    setTimeout(() => { if (this.state === 'playing') this.state = 'lose'; }, 1200);
  },
  onWin() {
    if (this.state !== 'playing') return;
    this.state = 'win'; SFX.win();
    this.addScore(CFG.score.winBonus);
    if (this.score > Store.data.high) Store.data.high = this.score;
    for (const sk of CFG.skins)
      if (this.score >= sk.unlock && !Store.data.unlocked.includes(sk.id))
        Store.data.unlocked.push(sk.id);
    Store.save();
  },

  frame(t) {
    requestAnimationFrame(tt => this.frame(tt));
    let dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
    Input.poll();
    if (Input.pausePressed && (this.state==='playing'||this.state==='paused'))
      this.state = this.state==='playing' ? 'paused' : 'playing';
    if (Input.mutePressed) SFX.toggle();

    const ctx = this.ctx;
    if (this.state === 'playing') this.update(dt);
    else { dt = FX.update(dt); } // 非游玩状态也更新粒子
    this.render(ctx);
    Input.clearFrame();
  },

  update(rawDt) {
    this.time += rawDt;
    const dt = FX.update(rawDt);
    if (dt === 0) return; // 顿帧中
    if (this.bannerT > 0) this.bannerT -= rawDt;

    this.player.update(dt, this);
    for (const e of [...this.enemies]) e.update(dt, this);
    for (const b of [...this.pBullets]) if (!b.update(dt)) this.pBullets.splice(this.pBullets.indexOf(b), 1);
    for (const b of [...this.eBullets]) if (!b.update(dt)) this.eBullets.splice(this.eBullets.indexOf(b), 1);
    for (const gr of [...this.grenades]) {
      if (!gr.update(dt)) { // 落地爆炸
        this.grenades.splice(this.grenades.indexOf(gr), 1);
        FX.explosion(gr.x, gr.y, 1.1); FX.hitStop(CFG.feel.hitStopSmall);
        for (const e of [...this.enemies])
          if (dist({x:gr.x,y:gr.y}, e) < CFG.player.grenadeAoE + e.r)
            e.takeDamage(CFG.player.grenadeDamage, this, e.x, e.y);
      }
    }
    for (const p of [...Level.pows]) p.update(dt, this);
    for (const p of [...this.pickups]) if (!p.update(dt, this)) this.pickups.splice(this.pickups.indexOf(p), 1);

    // 碰撞: 玩家子弹 -> 敌人
    for (const b of [...this.pBullets]) {
      for (const e of [...this.enemies]) {
        if (dist2(b, e) < (b.r + e.r) * (b.r + e.r)) {
          this.pBullets.splice(this.pBullets.indexOf(b), 1);
          FX.addShake(CFG.feel.shakeOnHit);
          e.takeDamage(b.dmg, this, b.x, b.y);
          break;
        }
      }
    }
    // 敌方子弹 -> 玩家
    for (const b of [...this.eBullets]) {
      const p = this.player;
      if (!p.dead && dist2(b, p) < (b.r + p.r) * (b.r + p.r)) {
        this.eBullets.splice(this.eBullets.indexOf(b), 1);
        p.hurt(b.dmg, this);
      }
    }
    Level.update(this);

    // 镜头跟随
    const tx = this.player.x - this.vw/2, ty = this.player.y - this.vh/2;
    this.cam.x += (tx - this.cam.x) * Math.min(1, rawDt*6);
    this.cam.y += (ty - this.cam.y) * Math.min(1, rawDt*6);
    this.cam.x = clamp(this.cam.x, 0, Math.max(0, CFG.world.w - this.vw));
    this.cam.y = clamp(this.cam.y, 0, Math.max(0, CFG.world.h - this.vh));
  },

  // ================= 渲染 =================
  render(ctx) {
    ctx.clearRect(0, 0, this.vw, this.vh);
    if (this.state === 'loading') {
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '20px sans-serif';
      ctx.fillText('装载中…', this.vw/2, this.vh/2);
      return;
    }
    if (this.state === 'title') { this.renderTitle(ctx); return; }

    ctx.save();
    const sh = FX.shakeOffset();
    ctx.translate(-this.cam.x + sh.x, -this.cam.y + sh.y);
    Level.drawGround(ctx);
    // 按y排序绘制实体, 简单深度
    const drawables = [
      ...Level.pows, ...this.pickups,
      ...this.enemies, this.player,
      ...this.pBullets, ...this.eBullets, ...this.grenades,
    ].sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw && d.draw(ctx);
    Level.drawDecor(ctx); // 树在上层, 遮挡感
    FX.draw(ctx);
    // 世界坐标转回屏幕画HUD前恢复
    ctx.restore();

    this.renderHUD(ctx);
    if (this.state === 'win') this.renderEnd(ctx, true);
    if (this.state === 'lose') this.renderEnd(ctx, false);
    if (this.state === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, this.vw, this.vh);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 34px sans-serif';
      ctx.fillText('已暂停', this.vw/2, this.vh/2);
      ctx.font = '18px sans-serif'; ctx.fillText('按 P 继续', this.vw/2, this.vh/2 + 44);
    }
    this.renderTouchUI(ctx);
  },

  renderHUD(ctx) {
    const p = this.player; if (!p) return;
    ctx.textAlign = 'left';
    // 血条
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.roundRect(16, 14, 220, 26, 13); ctx.fill();
    const k = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = k > 0.5 ? '#5fd35f' : k > 0.25 ? '#f5a623' : '#e74c3c';
    if (k > 0) { ctx.beginPath(); ctx.roundRect(16, 14, 220*k, 26, 13); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif';
    ctx.fillText(Math.ceil(p.hp) + '', 26, 33);
    // 战俘 / 手雷 / 分数
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('🎖 ' + this.rescuedCount + '/' + CFG.pow.count, 16, 66);
    ctx.fillText('💣×' + p.grenades, 16, 94);
    ctx.textAlign = 'right';
    ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#ffe28a';
    ctx.fillText(this.score + ' 分', this.vw - 16, 34);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '13px sans-serif';
    ctx.fillText('最高 ' + Store.data.high, this.vw - 16, 56);
    // Boss血条
    if (this.bossSpawned && this.boss && !this.bossDead) {
      const bw = Math.min(480, this.vw - 60), bk = Math.max(0, this.boss.hp / CFG.enemies.boss.hp);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect((this.vw-bw)/2, 66, bw, 14);
      ctx.fillStyle = '#e74c3c'; ctx.fillRect((this.vw-bw)/2, 66, bw*bk, 14);
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText('重型坦克', this.vw/2, 62);
    }
    // 横幅
    if (this.bannerT > 0) {
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, this.bannerT);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif';
      ctx.fillText(this.bannerText, this.vw/2, 130);
      ctx.font = '16px sans-serif'; ctx.fillStyle = '#ffe28a';
      ctx.fillText(this.bannerSub, this.vw/2, 158);
      ctx.globalAlpha = 1;
    }
  },

  renderTouchUI(ctx) {
    if (this.state !== 'playing' || !('ontouchstart' in window)) return;
    const g = Input._grenadeBtn;
    // 手雷按钮
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI*2); ctx.fill();
    ctx.font = '30px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('💣', g.x, g.y + 11);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif';
    ctx.fillText('×' + this.player.grenades, g.x, g.y + 34);
    // 摇杆
    if (Input._joyId !== null) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(Input._joyOX, Input._joyOY, 60, 0, Math.PI*2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath(); ctx.arc(Input._joyOX + Input._joyDX*60, Input._joyOY + Input._joyDY*60, 26, 0, Math.PI*2); ctx.fill();
    }
  },

  renderTitle(ctx) {
    // 背景
    const gr = ctx.createLinearGradient(0, 0, 0, this.vh);
    gr.addColorStop(0, '#2c3e2a'); gr.addColorStop(1, '#141c12');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe28a'; ctx.font = 'bold 52px sans-serif';
    ctx.fillText('铁甲营救', this.vw/2, this.vh*0.24);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '17px sans-serif';
    ctx.fillText('开着吉普深入敌后，救出 5 名战俘！', this.vw/2, this.vh*0.24 + 40);
    ctx.fillText('致敬 80 后街机经典 · 精神续作', this.vw/2, this.vh*0.24 + 66);

    // 皮肤选择
    const cy = this.vh*0.52, skins = CFG.skins;
    if (this._selSkin === undefined) this._selSkin = Store.data.skin;
    const sk = skins[this._selSkin], unlocked = Store.data.unlocked.includes(sk.id);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 19px sans-serif';
    ctx.fillText('选择战车', this.vw/2, cy - 92);
    // 预览
    const img = Assets.playerSkin(sk.id);
    ctx.save(); ctx.translate(this.vw/2, cy - 20);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.arc(0, 0, 56, 0, Math.PI*2); ctx.fill();
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, -44, -44, 88, 88);
    else Fallback.jeep(ctx, 88, '#4a7c3a');
    ctx.restore();
    ctx.font = '17px sans-serif'; ctx.fillStyle = unlocked ? '#fff' : '#999';
    ctx.fillText(sk.name + (unlocked ? '' : '（' + sk.unlock + ' 分解锁）'), this.vw/2, cy + 52);
    // 左右箭头
    ctx.font = 'bold 40px sans-serif'; ctx.fillStyle = '#ffe28a';
    ctx.fillText('◀', this.vw/2 - 130, cy - 8);
    ctx.fillText('▶', this.vw/2 + 130, cy - 8);
    this._skinL = { x: this.vw/2-130, y: cy-8, r: 34 };
    this._skinR = { x: this.vw/2+130, y: cy-8, r: 34 };

    // 开始按钮
    const bw = 220, bh = 58, bx = this.vw/2 - bw/2, by = this.vh*0.72;
    ctx.fillStyle = unlocked ? '#e67e22' : '#777';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif';
    ctx.fillText(unlocked ? '开始行动' : '皮肤未解锁', this.vw/2, by + 38);
    this._startBtn = { x: bx, y: by, w: bw, h: bh, ok: unlocked };

    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '14px sans-serif';
    ctx.fillText('操作：左侧摇杆移动 · 自动射击 · 右下按钮扔手雷', this.vw/2, this.vh*0.72 + 92);
    ctx.fillText('最高分：' + Store.data.high, this.vw/2, this.vh*0.72 + 114);

    // 点击处理
    let tap;
    while ((tap = Input.consumeTap())) {
      SFX.init(); SFX.resume();
      const dL = Math.hypot(tap.x - this._skinL.x, tap.y - this._skinL.y);
      const dR = Math.hypot(tap.x - this._skinR.x, tap.y - this._skinR.y);
      if (dL < 44) { this._selSkin = (this._selSkin + skins.length - 1) % skins.length; SFX.hit(); }
      else if (dR < 44) { this._selSkin = (this._selSkin + 1) % skins.length; SFX.hit(); }
      else if (tap.x > bx && tap.x < bx+bw && tap.y > by && tap.y < by+bh && unlocked) {
        Store.data.skin = sk.id; Store.save();
        this.startGame();
      }
    }
  },

  renderEnd(ctx, win) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.textAlign = 'center';
    ctx.fillStyle = win ? '#ffe28a' : '#ff8a8a';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(win ? '任务完成！' : '任务失败', this.vw/2, this.vh*0.36);
    ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif';
    ctx.fillText('得分：' + this.score, this.vw/2, this.vh*0.36 + 46);
    ctx.fillText('战俘：' + this.rescuedCount + '/' + CFG.pow.count, this.vw/2, this.vh*0.36 + 76);
    if (win) {
      ctx.fillStyle = '#9fff9f'; ctx.font = '16px sans-serif';
      const newly = CFG.skins.filter(s => this.score >= s.unlock && s.id !== 0);
      ctx.fillText(newly.length ? '解锁皮肤：' + newly.map(s=>s.name).join('、') : '再接再厉，冲击更高分解锁皮肤！',
        this.vw/2, this.vh*0.36 + 106);
    }
    const bw = 200, bh = 54, bx = this.vw/2 - bw/2, by = this.vh*0.62;
    ctx.fillStyle = '#e67e22'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 12); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif';
    ctx.fillText('再来一局', this.vw/2, by + 35);
    this._retryBtn = { x: bx, y: by, w: bw, h: bh };
    let tap;
    while ((tap = Input.consumeTap())) {
      if (tap.x > bx && tap.x < bx+bw && tap.y > by && tap.y < by+bh) { this._selSkin = undefined; this.state = 'title'; }
    }
  },
};

window.addEventListener('load', () => G.init());
