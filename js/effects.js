// 打击感系统: 粒子池 / 震屏 / 顿帧 / 飘字 / 爆炸 / 枪口火光
// 全部对象池化, 零运行时分配, 手机 60fps 无压力。
const FX = {
  particles: [], pCount: 0, PMAX: 600,
  numbers: [], nCount: 0, NMAX: 40,
  trauma: 0, freeze: 0, flashT: 0,

  init() {
    for (let i = 0; i < this.PMAX; i++)
      this.particles.push({ x:0,y:0,vx:0,vy:0,life:0,max:1,size:3,color:'#fff',grav:0,drag:0,ring:false,rw:0 });
    for (let i = 0; i < this.NMAX; i++)
      this.numbers.push({ x:0,y:0,life:0,text:'',color:'#fff',size:16 });
  },

  spawn(x, y, vx, vy, life, size, color, grav, drag, ring) {
    const p = this.particles[this.pCount % this.PMAX]; this.pCount++;
    p.x=x; p.y=y; p.vx=vx; p.vy=vy; p.life=life; p.max=life;
    p.size=size; p.color=color; p.grav=grav||0; p.drag=drag||0;
    p.ring=!!ring; p.rw=ring?4:0;
  },

  // 火花: 命中瞬间
  sparks(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 120 + Math.random() * 320;
      this.spawn(x, y, Math.cos(a)*s, Math.sin(a)*s, 0.25+Math.random()*0.25,
        2+Math.random()*3, color || '#ffd54a', 500, 3);
    }
  },
  // 爆炸: 白闪->火球->浓烟->冲击波
  explosion(x, y, scale) {
    scale = scale || 1;
    this.spawn(x, y, 0, 0, 0.12, 46*scale, '#fff8e0', 0, 0);           // 白闪
    for (let i = 0; i < 14*scale; i++) {                              // 火球
      const a = Math.random()*Math.PI*2, s = 40+Math.random()*160*scale;
      this.spawn(x, y, Math.cos(a)*s, Math.sin(a)*s, 0.35+Math.random()*0.25,
        5+Math.random()*7*scale, ['#ff9a3c','#ff6b35','#ffc93c'][i%3], -60, 2.5);
    }
    for (let i = 0; i < 8*scale; i++) {                               // 浓烟
      const a = Math.random()*Math.PI*2, s = 20+Math.random()*60;
      this.spawn(x+(Math.random()-0.5)*30, y+(Math.random()-0.5)*30,
        Math.cos(a)*s, Math.sin(a)*s - 60, 0.9+Math.random()*0.5,
        8+Math.random()*8*scale, 'rgba(60,60,60,0.55)', -40, 1.5);
    }
    this.spawn(x, y, 0, 0, 0.35, 10, 'rgba(255,220,150,0.8)', 0, 0, true); // 冲击波环
    this.addShake(CFG.feel.shakeOnExplode * scale);
    SFX.explosion(scale > 1.4);
  },
  muzzle(x, y, angle) {
    for (let i = 0; i < 4; i++) {
      const a = angle + (Math.random()-0.5)*0.5, s = 200+Math.random()*200;
      this.spawn(x, y, Math.cos(a)*s, Math.sin(a)*s, 0.08+Math.random()*0.06, 3, '#ffe28a', 0, 4);
    }
  },
  puff(x, y) {
    this.spawn(x, y, (Math.random()-0.5)*40, -50-Math.random()*40, 0.6, 6+Math.random()*5, 'rgba(120,120,120,0.4)', -30, 1);
  },
  sparkle(x, y) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random()*Math.PI*2, s = 60+Math.random()*120;
      this.spawn(x, y, Math.cos(a)*s, Math.sin(a)*s, 0.5, 3, '#9fff9f', -80, 2);
    }
  },

  damageNumber(x, y, amount, color) {
    const n = this.numbers[this.nCount % this.NMAX]; this.nCount++;
    n.x = x + (Math.random()-0.5)*20; n.y = y - 18; n.life = 0.8;
    n.text = Math.round(amount) + ''; n.color = color || '#fff'; n.size = 15 + Math.min(10, amount * 0.15);
  },
  addShake(amount) { this.trauma = Math.min(1, this.trauma + amount); },
  hitStop(t) { this.freeze = Math.max(this.freeze, t); },
  screenFlash() { this.flashT = 0.12; },

  update(dt) {
    if (this.freeze > 0) { this.freeze -= dt; return 0; } // 顿帧: 返回0跳过逻辑更新
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    if (this.flashT > 0) this.flashT -= dt;
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy += p.grav * dt;
      const dr = 1 - Math.min(0.95, p.drag * dt);
      p.vx *= dr; p.vy *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.ring) p.rw += 620 * dt;
    }
    for (const n of this.numbers) { if (n.life > 0) { n.life -= dt; n.y -= 55 * dt; } }
    return dt;
  },

  // 震屏偏移, 每帧渲染前调用
  shakeOffset() {
    const s = this.trauma * this.trauma * 22;
    return { x: (Math.random()-0.5)*2*s, y: (Math.random()-0.5)*2*s };
  },

  draw(ctx) {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      const a = Math.max(0, p.life / p.max);
      if (p.ring) {
        ctx.globalAlpha = a; ctx.strokeStyle = p.color; ctx.lineWidth = 5*a+1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.rw, 0, Math.PI*2); ctx.stroke();
      } else {
        ctx.globalAlpha = a; ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; 
    for (const n of this.numbers) {
      if (n.life <= 0) continue;
      ctx.globalAlpha = Math.min(1, n.life * 2);
      ctx.font = 'bold ' + n.size + 'px "PingFang SC", sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
      ctx.strokeText(n.text, n.x, n.y);
      ctx.fillStyle = n.color; ctx.fillText(n.text, n.x, n.y);
    }
    ctx.globalAlpha = 1;
    if (this.flashT > 0) {
      ctx.fillStyle = 'rgba(255,240,200,' + (this.flashT * 2.5) + ')';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
  },
};
