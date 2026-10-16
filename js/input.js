// ===== 输入: 左摇杆移动 + 右开火键 + 右手雷键 =====
const Input = {
  _keys: {}, taps: [],
  joy: { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 },
  fire: false,            // 开火键是否按住(触屏按钮 / 空格)
  _fireId: -1,
  _grenade: false,
  _grenadeId: -1,
  _fireBtn: null,         // {x,y,r} 逻辑坐标
  _grenadeBtn: null,

  init(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', e => {
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'Space') this.fire = true;
      if ((e.code === 'KeyQ' || e.code === 'KeyE') && !e.repeat) this._grenade = true;
      this._keys[e.code] = true;
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'Space') this.fire = false;
      this._keys[e.code] = false;
    });
    const pos = (t) => {
      const r = canvas.getBoundingClientRect();
      return { x: (t.clientX - r.left) / r.width * G.vw, y: (t.clientY - r.top) / r.height * G.vh };
    };
    const onBtn = (p, id) => {
      const f = this._fireBtn, g = this._grenadeBtn;
      if (f && Math.hypot(p.x - f.x, p.y - f.y) <= f.r + 14) { this.fire = true; this._fireId = id; return true; }
      if (g && Math.hypot(p.x - g.x, p.y - g.y) <= g.r + 14) { this._grenade = true; this._grenadeId = id; return true; }
      return false;
    };
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const p = pos(t);
        if (onBtn(p, t.identifier)) continue;
        if (!this.joy.active && p.x < G.vw * 0.5) {
          this.joy.active = true; this.joy.id = t.identifier;
          this.joy.ox = p.x; this.joy.oy = p.y; this.joy.dx = 0; this.joy.dy = 0;
        } else {
          this.taps.push(p); // 标题画面点选
        }
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this.joy.active && t.identifier === this.joy.id) {
          const p = pos(t);
          let dx = p.x - this.joy.ox, dy = p.y - this.joy.oy;
          const len = Math.hypot(dx, dy), max = 62;
          if (len > max) { dx = dx / len * max; dy = dy / len * max; }
          this.joy.dx = dx / max; this.joy.dy = dy / max;
        }
      }
    }, { passive: false });
    const endT = e => {
      for (const t of e.changedTouches) {
        if (this.joy.active && t.identifier === this.joy.id) {
          this.joy.active = false; this.joy.dx = 0; this.joy.dy = 0;
        }
        if (t.identifier === this._fireId) { this.fire = false; this._fireId = -1; }
        if (t.identifier === this._grenadeId) { this._grenadeId = -1; }
      }
    };
    canvas.addEventListener('touchend', endT);
    canvas.addEventListener('touchcancel', endT);
    // 桌面鼠标点按钮
    canvas.addEventListener('mousedown', e => {
      const p = pos(e);
      if (!onBtn(p, 'mouse')) this.taps.push(p);
    });
    canvas.addEventListener('mouseup', () => { if (this._fireId === 'mouse') { this.fire = false; this._fireId = -1; } });
  },

  // 移动向量: 键盘优先, 否则摇杆
  moveVec() {
    const k = this._keys;
    let x = 0, y = 0;
    if (k['KeyA'] || k['ArrowLeft']) x -= 1;
    if (k['KeyD'] || k['ArrowRight']) x += 1;
    if (k['KeyW'] || k['ArrowUp']) y -= 1;
    if (k['KeyS'] || k['ArrowDown']) y += 1;
    if (x || y) { const l = Math.hypot(x, y); return { x: x / l, y: y / l }; }
    if (this.joy.active) {
      const dx = this.joy.dx, dy = this.joy.dy, l = Math.hypot(dx, dy);
      if (l > 0.18) return { x: dx / l, y: dy / l };
    }
    return null;
  },
  consumeGrenade() { const g = this._grenade; this._grenade = false; return g; },
  consumeTap() { return this.taps.shift(); },
  reset() {
    this.taps.length = 0; this.fire = false; this._grenade = false;
    this.joy.active = false; this.joy.dx = 0; this.joy.dy = 0;
    this._fireId = -1; this._grenadeId = -1;
  }
};
