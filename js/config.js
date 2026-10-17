// ===== 铁甲营救 v2: 赤色要塞-like 配置 =====
const CFG = {
  world: { w: 1600, h: 3800 },          // 纵向滚屏大地图
  player: {
    speed: 340,                         // 吉普速度 px/s
    turn: 6.4,                          // 转向速度 rad/s
    hp: 100, r: 26,
    mgDmg: 9, mgRate: 7,                // 机枪: 伤害 / 射速(发/秒)
    grenades: 3,
    aboardMax: 7,                       // 车载战俘上限(原版设定)
  },
  // 武器升级树: 手雷 → 火箭筒 → 远程导弹 → 散射导弹 (升级的是投掷武器, 原版规则)
  weapons: [
    { name: '手雷',   range: 300, speed: 0,    flyT: 0.55, dmg: 130, radius: 150, shake: 0.32, arc: true,  color: '#2f3a24' },
    { name: '火箭筒', range: 430, speed: 800,  flyT: 0.54, dmg: 210, radius: 190, shake: 0.42, arc: false, color: '#ff9a3c' },
    { name: '远程导弹', range: 640, speed: 1050, flyT: 0.61, dmg: 290, radius: 230, shake: 0.5, arc: false, color: '#7ddcff' },
    { name: '散射导弹', range: 600, speed: 950,  flyT: 0.63, dmg: 200, radius: 180, shake: 0.44, arc: false, color: '#d0ff5a', spread: 3 },
  ],
  rescuePerUpgrade: 3,                  // 累计救3人 → 武器升1级(闪烁战俘直接升级; 吉普载员上限7, 里程碑须可达)
  score: {
    soldier: 100, scout: 100, jeep: 150, turret: 250, tank: 300,
    boss: 5000, pow: 500, building: 100, golden: 500, winBonus: 1000,
  },
  skins: [
    { id: 'green',  name: '军绿突击', filter: 'none',                price: 0,    desc: '经典军绿涂装' },
    { id: 'desert', name: '沙漠之狐', filter: 'hue-rotate(-38deg) saturate(1.25)', price: 3000,  desc: '沙漠黄涂装' },
    { id: 'navy',   name: '深海幽灵', filter: 'hue-rotate(155deg) saturate(1.35)', price: 8000,  desc: '深海蓝涂装' },
  ],
  feel: { shakeOnExplode: 0.32 },
};
