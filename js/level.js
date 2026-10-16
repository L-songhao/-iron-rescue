// 关卡: 纵向滚屏大地图像 / 建筑 / 敌人布局 / Boss触发 / 胜负
// 地面预渲染到离屏canvas, 运行时零开销。
const Level = {
  ground: null, decor: [],

  build(game) {
    const W = CFG.world.w, H = CFG.world.h;
    // --- 地面预渲染 ---
    const g = document.createElement('canvas');
    g.width = W; g.height = H;
    const c = g.getContext('2d');
    c.fillStyle = '#5a6b3c'; c.fillRect(0, 0, W, H);
    // 草地噪点
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = `rgba(${40+Math.random()*40|0},${70+Math.random()*40|0},${30+Math.random()*25|0},.5)`;
      const s = 3 + Math.random() * 9;
      c.fillRect(Math.random() * W, Math.random() * H, s, s * 0.7);
    }
    // 中央道路(纵向)
    c.fillStyle = '#8a7a5c';
    c.fillRect(W / 2 - 70, 0, 140, H);
    c.fillStyle = '#7a6a4e';
    for (let y = 0; y < H; y += 90) c.fillRect(W / 2 - 70, y, 140, 12);
    // 顶部 Boss 区域: 停机坪式空地
    c.fillStyle = '#6b6f5a';
    c.beginPath(); c.ellipse(W / 2, 330, 330, 200, 0, 0, 7); c.fill();
    c.strokeStyle = '#d8cf9a'; c.lineWidth = 10;
    c.beginPath(); c.ellipse(W / 2, 330, 300, 175, 0, 0, 7); c.stroke();
    this.ground = g;

    // --- 装饰(背景层) ---
    this.decor = [];
    const put = (img, n, sMin, sMax) => {
      for (let i = 0; i < n; i++)
        this.decor.push({ img, x: 60 + Math.random() * (W - 120), y: 60 + Math.random() * (H - 120), s: sMin + Math.random() * (sMax - sMin), r: Math.random() * 6.28 });
    };
    put('tree', 90, 46, 80); put('rock', 60, 30, 58); put('sandbag', 70, 40, 62);

    // --- 建筑布局 (x, y, type, opts) ---
    const B = [
      [400, 3200, 'barracks'], [1150, 3050, 'bunker'], [800, 2780, 'depot'],
      [350, 2480, 'bunker'], [1200, 2330, 'barracks', { powerup: true }], [650, 2030, 'barracks'],
      [1050, 1730, 'bunker'], [450, 1430, 'depot'], [950, 1130, 'barracks'], [1300, 880, 'bunker'],
    ];
    game.buildings = B.map(([x, y, t, o]) => new Building(x, y, t, o));

    // --- 敌人布局 ---
    const E = [
      [700, 3300, 'soldier'], [950, 3150, 'soldier'], [500, 2950, 'soldier'],
      [1250, 2900, 'turret'], [300, 2650, 'scout'], [900, 2600, 'soldier'],
      [1350, 2500, 'tank'], [600, 2250, 'soldier'], [1050, 2150, 'turret'],
      [400, 1950, 'jeep'], [850, 1900, 'soldier'], [1250, 1850, 'soldier'],
      [550, 1600, 'tank'], [1000, 1550, 'scout'], [1400, 1500, 'turret'],
      [350, 1250, 'soldier'], [750, 1200, 'jeep'], [1150, 1050, 'tank'],
      [500, 800, 'soldier'], [1000, 750, 'turret'],
    ];
    game.enemies = E.map(([x, y, t]) => new Enemy(x, y, t));
    // 隐藏金色侦察兵(彩蛋): 藏在角落
    game.enemies.push(new Enemy(150, 150, 'golden'));
    game.enemies.push(new Enemy(1450, 3650, 'golden'));

    game.pows = [];
    game.pickups = [new Pickup(800, 3350, 'grenade')];
    game.boss = null; game.bossSpawned = false;
  },

  update(game, dt) {
    // Boss: 玩家接近顶部区域时出现
    if (!game.bossSpawned && game.player.y < 1050) {
      game.bossSpawned = true;
      game.boss = new Boss(CFG.world.w / 2, 380);
      game.banner('⚠ 敌方重型坦克出现!', 2.2);
      SFX.bossWarn();
      FX.addShake(0.4);
    }
    // 胜利: Boss被击杀
    if (game.bossSpawned && game.boss && game.boss.dead && game.state === 'playing') game.onWin();
  },

  drawGround(ctx) { if (this.ground) ctx.drawImage(this.ground, 0, 0); },
  drawDecor(ctx, cam) {
    for (const d of this.decor) {
      if (d.x < cam.x - 80 || d.x > cam.x + cam.w + 80 || d.y < cam.y - 80 || d.y > cam.y + cam.h + 80) continue;
      const img = Assets.imgs[d.img];
      if (!img || !img.complete || !img.naturalWidth) continue;
      ctx.save();
      ctx.translate(d.x, d.y); ctx.rotate(d.r);
      drawShadow(ctx, 0, 4, d.s * 0.4);
      ctx.drawImage(img, -d.s / 2, -d.s / 2, d.s, d.s);
      ctx.restore();
    }
  },
};
