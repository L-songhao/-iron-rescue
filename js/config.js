// 铁甲营救 - 全局调参。改数值只改这里。
const CFG = {
  world: { w: 2600, h: 2600 },

  player: {
    speed: 270, hp: 100, radius: 26,
    mgDamage: 9, mgRate: 7, mgRange: 460, mgSpeed: 900,
    grenades: 3, grenadeMax: 5, grenadeDamage: 70, grenadeAoE: 140, grenadeSpeed: 620,
    accel: 1400, friction: 6,
  },

  enemies: {
    scout: { hp: 32, speed: 165, radius: 24, mgDamage: 5, mgRate: 0.8, mgRange: 430, mgSpeed: 520, score: 100, color: '#b03a2e' },
    tank:  { hp: 95, speed: 72,  radius: 30, shellDamage: 16, shellRate: 0.42, shellRange: 520, shellSpeed: 380, score: 300, color: '#5d6d7e' },
    turret:{ hp: 65, speed: 0,   radius: 28, mgDamage: 8, mgRate: 0.55, mgRange: 560, mgSpeed: 560, score: 200, color: '#7d6608' },
    boss:  { hp: 650, speed: 55, radius: 46, shellDamage: 20, shellRate: 0.9, shellRange: 620, shellSpeed: 400, score: 2000, color: '#6e2c00' },
  },

  pow: { count: 5, rescueRadius: 70 },

  // 皮肤: demo用换色实现, 0氪金美术成本; 手绘精美皮肤以后再上
  skins: [
    { id: 0, name: '军绿突击', filter: 'none', unlock: 0 },
    { id: 1, name: '沙漠之狐', filter: 'hue-rotate(-45deg) saturate(1.25)', unlock: 800 },
    { id: 2, name: '深海幽灵', filter: 'hue-rotate(150deg) saturate(1.1)', unlock: 2000 },
  ],

  // 隐藏奖励怪: 金色侦察兵, 藏在地图角落
  goldenScout: { hp: 22, speed: 210, radius: 22, score: 500, color: '#f7d154' },

  score: { powRescue: 200, winBonus: 1000 },

  // 打击感调参
  feel: {
    shakeOnHit: 0.12, shakeOnExplode: 0.35, shakeOnBossExplode: 0.7, shakeOnPlayerHit: 0.3,
    hitStopSmall: 0.03, hitStopBig: 0.07,
    flashTime: 0.09,
  },

  colors: {
    grass1: '#5a7d3c', grass2: '#4e7033', dirt: '#8a6f4d',
    shadow: 'rgba(0,0,0,0.28)',
  },
};
