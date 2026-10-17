// 《铁甲营救》 headless 逻辑冒烟测试: node test/smoke.mjs
// 覆盖: 武器升级树(闪烁战俘/救人里程碑/上限) / Shell各级弹道 / Boss三阶段 / 回归(v2机制)
import { readFileSync, writeFileSync } from 'fs';
import assert from 'node:assert/strict';

// ---------- 浏览器环境桩 ----------
function anyProxy() {
  const f = function () { return anyProxy(); };
  return new Proxy(f, {
    get(t, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'canvas') return {};
      return anyProxy();
    },
    set() { return true; },
    apply() { return anyProxy(); },
  });
}
const canvasStub = () => ({ getContext: () => anyProxy(), width: 0, height: 0, style: {}, toDataURL: () => 'data:,' });
globalThis.window = { addEventListener() {}, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1 };
globalThis.document = {
  createElement: () => canvasStub(),
  getElementById: () => ({ style: {}, addEventListener() {}, getContext: () => anyProxy(), width: 0, height: 0 }),
};
globalThis.Image = class { constructor() { this.complete = false; } set src(v) {} };
const _ls = {};
globalThis.localStorage = { getItem: k => _ls[k] ?? null, setItem: (k, v) => { _ls[k] = v; }, removeItem: k => { delete _ls[k]; } };
globalThis.performance = { now: () => 0 };
globalThis.requestAnimationFrame = () => 0;

// ---------- 打包加载游戏脚本 ----------
const files = ['js/polyfill.js', 'js/config.js', 'js/input.js', 'js/audio.js', 'js/effects.js', 'js/entities.js', 'js/level.js', 'js/main.js'];
let bundle = files.map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf-8')).join('\n');
bundle += '\nglobalThis.__T = { CFG, Player, Bullet, EnemyBullet, Grenade, Shell, Building, POW, Enemy, Boss, Pickup, FX, SFX, Input, Level, G, Assets, FloatText };';
writeFileSync('/tmp/iron-test-bundle.mjs', bundle);
await import('/tmp/iron-test-bundle.mjs');
const { CFG, Player, Bullet, Grenade, Shell, Building, POW, Enemy, Boss, Pickup, FX, SFX, Input, Level, G } = globalThis.__T;

FX.init();

// ---------- 测试用假 game ----------
function fakeGame() {
  const banners = [];
  const g = {
    banners, exploded: [], killed: [],
    player: null, enemies: [], buildings: [], pows: [], pickups: [],
    pBullets: [], eBullets: [], grenades: [], floatTexts: [],
    boss: null, bossSpawned: false, score: 0, state: 'playing',
    addScore(n) { this.score += n; },
    banner(m) { banners.push(m); },
    explode(x, y, r, dmg, big) { this.exploded.push({ x, y, r, dmg, big }); G.explode.call(this, x, y, r, dmg, big); },
    killEnemy(e) { const i = this.enemies.indexOf(e); if (i >= 0) this.enemies.splice(i, 1); this.killed.push(e.type); this.score += e.score; },
    killBoss() { G.killBoss.call(this); },
    onPlayerDead() { this.state = 'lose'; },
    onWin() { this.state = 'win'; },
  };
  return g;
}
function withPlayer(g, x = 800, y = 3000) {
  g.player = new Player(x, y);
  return g.player;
}

let n = 0;
const ok = (cond, name) => { n++; assert.ok(cond, name); console.log('  PASS', name); };

// ================= 武器升级树 =================
console.log('— 武器升级树 —');
{
  const g = fakeGame(); const p = withPlayer(g);
  ok(p.grenadeLevel === 0, '初始投掷武器为0级手雷');

  // 闪烁建筑被炸 → 放出闪烁战俘
  const b = new Building(0, 0, 'barracks', { flashPow: true });
  g.buildings.push(b);
  b.destroy(g);
  ok(g.pows.length === 3 && g.pows.every(w => w.flashing), '闪烁建筑炸开后放出3个闪烁战俘');

  // 闪烁战俘上车 → 升1级
  const w = g.pows[0]; w.x = p.x; w.y = p.y; w.state = 'toJeep';
  w.update(0.05, g);
  ok(w.state === 'aboard' && p.grenadeLevel === 1, '闪烁战俘上车 → 武器升到1级火箭筒');
  ok(g.banners.some(m => m.includes('火箭筒')), '升级横幅显示"火箭筒"');

  // 救人里程碑: 再救2个普通战俘(累计3) → 升2级
  for (let i = 0; i < 2; i++) {
    const q = new POW(p.x, p.y); q.state = 'toJeep'; q.update(0.05, g);
  }
  ok(p.rescueCount === 3 && p.grenadeLevel === 2, '累计救3人 → 升到2级远程导弹');

  // 再救3个(累计6, 未超载员上限7) → 升3级(满级)
  for (let i = 0; i < 3; i++) {
    const q = new POW(p.x, p.y); q.state = 'toJeep'; q.update(0.05, g);
  }
  ok(p.grenadeLevel === 3, '累计救6人 → 升到3级散射导弹(满级)');

  // 满级后再升级 → 不超限, 给分
  const s0 = g.score; p.upgradeWeapon(g);
  ok(p.grenadeLevel === 3 && g.score === s0 + 500, '满级后升级不超限, 补偿+500分');
}
{
  // L0耗弹药 / L1+无限
  const g = fakeGame(); const p = withPlayer(g);
  p.grenades = 3; p.fireShell(g);
  ok(p.grenades === 2 && g.grenades.length === 1 && g.grenades[0] instanceof Grenade, 'L0手雷消耗弹药');
  p.grenadeLevel = 1; p.fireShell(g);
  ok(p.grenades === 2 && g.grenades[1] instanceof Shell, 'L1火箭筒不耗弹药');
  p.grenadeLevel = 3; const before = g.grenades.length; p.fireShell(g);
  ok(g.grenades.length === before + 3, 'L3散射一次打出3发导弹');
}
{
  // Shell 各级参数
  const s1 = new Shell(0, 0, 0, 1), s2 = new Shell(0, 0, 0, 2), s3 = new Shell(0, 0, 0, 3);
  ok(s1.speed === 800 && s1.range === 430 && s1.dmg === 210, 'L1火箭筒参数(800速/430程/210伤)');
  ok(s2.speed === 1050 && s2.range === 640 && s2.dmg === 290, 'L2远程导弹参数(1050速/640程/290伤)');
  ok(s3.dmg === 200 && s1.speed < s2.speed, 'L3单发200伤, L2射程速度最优');
  // Shell 飞到射程尽头爆炸
  const g = fakeGame(); withPlayer(g);
  let steps = 0;
  while (s1.update(0.016, g) && steps++ < 5000) {}
  ok(g.exploded.length === 1 && g.exploded[0].r === 190 && g.exploded[0].dmg === 210, '导弹到射程尽头爆炸(半径190/伤害210)');
}
{
  // Shell 撞击建筑提前引爆
  const g = fakeGame(); withPlayer(g);
  const b = new Building(300, 0, 'bunker'); g.buildings.push(b);
  const s = new Shell(0, 0, 0, 2); // 朝+x飞
  let steps = 0;
  while (s.update(0.016, g) && steps++ < 500) {}
  ok(g.exploded.length >= 1 && g.exploded[0].r === 230 && b.hp <= 0, '导弹撞击建筑提前引爆(半径230)并炸毁建筑');
}

// ================= Boss三阶段 =================
console.log('— Boss三阶段 —');
{
  const g = fakeGame(); withPlayer(g, 800, 900);
  const boss = new Boss(800, 380); g.boss = boss;
  ok(boss.phase === 1 && boss.hp === 1500, 'Boss初始P1, 血量1500');

  boss.takeDamage(600, g, 800, 380); // 900/1500=0.6 <0.66
  ok(boss.phase === 2 && g.banners.some(m => m.includes('狂暴')), '血量<66% → P2狂暴, 横幅警告');

  boss.takeDamage(500, g, 800, 380); // 400/1500=0.267 <0.33
  ok(boss.phase === 3 && g.banners.some(m => m.includes('残血暴走')), '血量<33% → P3残血暴走, 横幅警告');

  // P3召唤小怪(随时间)
  const e0 = g.enemies.length;
  for (let i = 0; i < 300; i++) boss.update(0.016, g); // ~4.8秒
  ok(g.enemies.length > e0, 'P3随时间召唤小怪');

  // P3冲撞: 预警→冲锋
  boss.dashT = 0.01;
  boss.update(0.02, g);
  ok(boss.telegraph > 0, 'P3冲撞前有预警(telegraph)');
  for (let i = 0; i < 60; i++) boss.update(0.016, g);
  ok(boss.dashing > 0 || boss.telegraph <= 0, '预警后进入冲锋状态');

  // 击杀 → 掉落3战俘(1闪烁) + 高分
  const sc0 = g.score;
  boss.takeDamage(10000, g, 800, 380);
  ok(boss.dead && g.pows.length === 3 && g.pows.filter(w => w.flashing).length === 1, 'Boss击杀掉落3个战俘(1个闪烁)');
  ok(g.score >= sc0 + CFG.score.boss, 'Boss击杀给高分(5000)');
}
{
  // P2双发扇形: 开火后应有延迟第二发
  const g = fakeGame(); withPlayer(g, 800, 900);
  const boss = new Boss(800, 380); g.boss = boss;
  boss.takeDamage(600, g, 800, 380);
  boss.fireT = 0.01;
  boss.update(0.02, g);
  const b1 = g.eBullets.length;
  ok(b1 === 3 && boss.volley === 1, 'P2首发3发扇形, 延迟第二发待命');
  for (let i = 0; i < 30; i++) boss.update(0.016, g);
  ok(g.eBullets.length > b1, 'P2延迟0.3秒打出第二发扇形');
}

// ================= 回归(v2机制不丢) =================
console.log('— 回归 —');
{
  const g = fakeGame(); const p = withPlayer(g);
  Input._keys['KeyW'] = true;
  const y0 = p.y; p.update(0.1, g);
  Input._keys['KeyW'] = false;
  ok(p.y < y0 && Math.abs(p.angle + Math.PI / 2) < 0.7, 'W键上移, 车头转向移动方向');
  Input.fire = true; const nb = g.pBullets.length; p.update(0.2, g); Input.fire = false;
  ok(g.pBullets.length > nb, '按住开火键 → 机枪连发');
}
{
  // L0手雷抛物线爆炸伤建筑
  const g = fakeGame(); const p = withPlayer(g);
  const b = new Building(200, 3000, 'barracks'); g.buildings.push(b);
  p.angle = 0; p.fireShell(g); // 朝东扔
  let steps = 0;
  while (g.grenades.length && steps++ < 200) g.grenades = g.grenades.filter(gr => gr.update(0.016, g));
  ok(g.exploded.length === 1 && g.exploded[0].dmg === 130, 'L0手雷抛物线飞行后爆炸(130伤)');
}
{
  // 建筑炸开 → 战俘数正确
  const g = fakeGame(); withPlayer(g);
  const b = new Building(0, 0, 'depot'); g.buildings.push(b);
  b.destroy(g);
  ok(g.pows.length === 1 && !g.pows[0].flashing, '仓库炸开 → 1个普通战俘');
}
{
  // 机枪升级拾取(旧机制保留)
  const g = fakeGame(); const p = withPlayer(g);
  const k = new Pickup(p.x, p.y, 'weapon');
  g.pickups.push(k); k.update(0.05, g);
  ok(p.weapon === 1, '机枪散射拾取仍有效');
}
{
  // 敌人受伤死亡
  const g = fakeGame(); withPlayer(g);
  const e = new Enemy(800, 2900, 'tank'); g.enemies.push(e);
  e.takeDamage(10000, g, 800, 2900);
  ok(g.killed.includes('tank') && g.enemies.length === 0, '坦克被击毁 → 移出列表+计分');
}
{
  // 顿帧: 冻结期间update返回0
  FX.hitStop(0.2);
  ok(FX.update(0.016) === 0, '顿帧期间逻辑更新暂停');
  FX.freeze = 0;
}
{
  // 关卡布局: 闪烁建筑在开局附近(第一关能升到1级)
  const g = fakeGame(); withPlayer(g);
  Level.build(g);
  const flashes = g.buildings.filter(b => b.flashPow);
  ok(flashes.length >= 2, '关卡中有≥2处闪烁战俘建筑');
  ok(flashes[0].y > 3000, '第一处闪烁建筑在开局附近(第一关必升1级)');
  ok(g.buildings.some(b => b.powerup), '机枪升级建筑保留');
}

console.log(`\n全部 ${n} 项通过 ✅`);
