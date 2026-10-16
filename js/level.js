// 第一关: 地形 / 装饰 / 战俘 / 波次 / Boss / 胜负
// 地面预渲染到离屏canvas, 运行时零开销。
const Level = {
  decor: [], pows: [], ground: null,

  build(game) {
    const W = CFG.world.w, H = CFG.world.h;
    this.decor = []; this.pows = []; game.enemies = []; game.wave = 0; game.bossSpawned = false;

    // 确定性随机, 每次同一张图
    let seed = 1234567;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    // 地面预渲染
    const g = document.createElement('canvas'); g.width = W; g.height = H;
    const c = g.getContext('2d');
    c.fillStyle = CFG.colors.grass1; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { // 草地斑块
      c.fillStyle = rnd() < 0.5 ? CFG.colors.grass2 : 'rgba(0,0,0,0.06)';
      const r = 20 + rnd()*70;
      c.beginPath(); c.ellipse(rnd()*W, rnd()*H, r, r*0.7, rnd()*3, 0, Math.PI*2); c.fill();
    }
    // 土路: 横竖各一条
    c.strokeStyle = CFG.colors.dirt; c.lineCap = 'round';
    c.lineWidth = 130; c.beginPath(); c.moveTo(0, H*0.5); c.lineTo(W, H*0.52); c.stroke();
    c.lineWidth = 110; c.beginPath(); c.moveTo(W*0.62, 0); c.lineTo(W*0.6, H); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 130;
    c.setLineDash([26, 30]); c.beginPath(); c.moveTo(0, H*0.5); c.lineTo(W, H*0.52); c.stroke();
    c.setLineDash([]);
    // 世界边缘: 铁丝网
    c.strokeStyle = '#7a6a55'; c.lineWidth = 14; c.setLineDash([30, 18]);
    c.strokeRect(10, 10, W-20, H-20); c.setLineDash([]);
    this.ground = g;

    // 装饰: 树/石头/沙袋 (避开出生点和路)
    const put = (type, n, minD) => {
      let placed = 0, guard = 0;
      while (placed < n && guard++ < n*20) {
        const x = 120 + rnd()*(W-240), y = 120 + rnd()*(H-240);
        if (Math.hypot(x-300, y-H+300) < 320) continue;         // 出生点
        if (Math.abs(y - H*0.5) < 110 || Math.abs(x - W*0.61) < 100) continue; // 路
        if (this.decor.some(d => Math.hypot(d.x-x, d.y-y) < minD)) continue;
        this.decor.push({ type, x, y, s: 0.8+rnd()*0.5, r: rnd()*6 });
        placed++;
      }
    };
    put('tree', 46, 130); put('rock', 26, 150);
    // 炮塔阵地沙袋
    this.turretPos = [[W*0.35,H*0.3],[W*0.68,H*0.42],[W*0.45,H*0.68],[W*0.75,H*0.75]];
    for (const [tx,ty] of this.turretPos)
      for (let i=-1;i<=1;i++) this.decor.push({ type:'sandbag', x:tx+i*44, y:ty+52, s:1, r:0 });

    // 战俘: 5个, 分散
    const powPos = [[W*0.3,H*0.25],[W*0.72,H*0.3],[W*0.4,H*0.55],[W*0.7,H*0.68],[W*0.25,H*0.78]];
    for (const [x,y] of powPos) this.pows.push(new POW(x, y));

    // 玩家出生: 左下角
    game.player.x = 300; game.player.y = H - 300;

    // 隐藏金色侦察兵 x2: 地图角落, 树后面
    game.enemies.push(new Enemy('golden', W-180, 200));
    game.enemies.push(new Enemy('golden', 200, 220));

    this.spawnWave(game, 1);
  },

  spawnWave(game, n) {
    game.wave = n;
    const W = CFG.world.w, H = CFG.world.h, E = game.enemies;
    const at = (type, x, y) => E.push(new Enemy(type, x, y));
    if (n === 1) {
      at('scout', W*0.5, H*0.35); at('scout', W*0.6, H*0.4);
      at('scout', W*0.4, H*0.6); at('turret', ...this.turretPos[0]); at('turret', ...this.turretPos[1]);
      game.banner('第 1 波：敌方巡逻队', '救出战俘，摧毁炮塔！');
    } else if (n === 2) {
      at('tank', W*0.55, H*0.3); at('tank', W*0.45, H*0.7);
      at('scout', W*0.65, H*0.55); at('scout', W*0.35, H*0.45);
      at('scout', W*0.6, H*0.75); at('turret', ...this.turretPos[2]);
      game.banner('第 2 波：装甲部队', '坦克炮弹伤害很高，走位！');
    } else if (n === 3) {
      at('tank', W*0.5, H*0.4); at('tank', W*0.62, H*0.62);
      at('scout', W*0.4, H*0.35); at('scout', W*0.7, H*0.5);
      at('scout', W*0.45, H*0.72); at('scout', W*0.58, H*0.28);
      at('turret', ...this.turretPos[3]);
      game.banner('最终波：要塞主力', '坚持住，Boss 要来了！');
    }
  },

  spawnBoss(game) {
    const W = CFG.world.w, H = CFG.world.h;
    game.bossSpawned = true;
    const boss = new Enemy('boss', W*0.55, H*0.2);
    game.enemies.push(boss);
    game.boss = boss;
    for (const [dx,dy] of [[-160,80],[160,80]]) game.enemies.push(new Enemy('scout', W*0.55+dx, H*0.2+dy));
    game.banner('警告：重型坦克出现！', '集火干掉它！');
    FX.addShake(0.5); SFX.explosion(true);
  },

  // 波次推进: 敌人清空 -> 下一波; 救出3战俘 -> Boss
  update(game) {
    const hostile = game.enemies.filter(e => e.type!=='golden');
    if (!game.bossSpawned && game.rescuedCount >= 3 && hostile.length === 0 && game.wave >= 3) {
      this.spawnBoss(game); return;
    }
    if (!game.bossSpawned && hostile.length === 0) {
      if (game.wave < 3) this.spawnWave(game, game.wave + 1);
      else if (game.rescuedCount < 3) game.banner('继续搜救战俘', '救出 3 名引出 Boss（'+game.rescuedCount+'/3）');
    }
    // 胜利: 救出全部战俘 + Boss击杀
    if (game.bossSpawned && game.bossDead && game.rescuedCount >= CFG.pow.count) game.onWin();
  },

  drawGround(ctx, cam) {
    if (this.ground) ctx.drawImage(this.ground, 0, 0);
  },
  drawDecor(ctx) {
    // 按y排序, 简单深度感
    const ds = [...this.decor].sort((a,b) => a.y - b.y);
    for (const d of ds) {
      const img = Assets.get(d.type), s = (d.type==='tree'?86:d.type==='rock'?64:70) * d.s;
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.r);
      if (d.type !== 'tree') drawShadow(ctx, 0, 0, s*0.4);
      if (img && img.complete && img.naturalWidth) ctx.drawImage(img, -s/2, -s/2, s, s);
      else {
        ctx.fillStyle = d.type==='tree' ? '#2d6a2d' : d.type==='rock' ? '#8d8d8d' : '#b09a72';
        ctx.beginPath(); ctx.arc(0, 0, s*0.35, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }
    // 树要画在载具上面才有遮挡感 -> 树单独第二遍画
    for (const d of ds) {
      if (d.type !== 'tree') continue;
      const img = Assets.get('tree'), s = 96 * d.s;
      if (img && img.complete && img.naturalWidth) ctx.drawImage(img, d.x-s/2, d.y-s*0.75, s, s);
    }
  },
};
