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
  score: {
    soldier: 100, scout: 100, jeep: 150, turret: 250, tank: 300,
    boss: 3000, pow: 500, building: 100, golden: 500, winBonus: 1000,
  },
  skins: [
    { id: 'green',  name: '军绿突击', filter: 'none',                price: 0,    desc: '经典军绿涂装' },
    { id: 'desert', name: '沙漠之狐', filter: 'hue-rotate(-38deg) saturate(1.25)', price: 3000,  desc: '沙漠黄涂装' },
    { id: 'navy',   name: '深海幽灵', filter: 'hue-rotate(155deg) saturate(1.35)', price: 8000,  desc: '深海蓝涂装' },
  ],
  feel: { shakeOnExplode: 0.32 },
};
