// 输入抽象：键盘(WASD/方向键+空格手雷) + 触屏(左半屏动态摇杆+右下手雷按钮)
// 对外暴露: Input.mx, Input.my (-1..1 移动向量), Input.grenade (按下即true, 消费制),
// Input.anyTap {x,y} (点击, 用于UI按钮), Input.pausePressed, Input.mutePressed
// 微信小游戏移植: 把 touchstart/move/end 换成 wx.onTouchStart 等, 逻辑不变。
const Input = {
  mx: 0, my: 0, grenade: false,
  taps: [], pausePressed: false, mutePressed: false,
  _keys: {}, _joyId: null, _joyOX: 0, _joyOY: 0, _joyDX: 0, _joyDY: 0,
  _grenadeBtn: { x: 0, y: 0, r: 46 },

  init(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      this._keys[e.code] = true;
      if (e.code === 'Space') this.grenade = true;
      if (e.code === 'KeyP') this.pausePressed = true;
      if (e.code === 'KeyM') this.mutePressed = true;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => { this._keys[e.code] = false; });

    const pos = t => {
      const r = canvas.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const p = pos(t);
        // 右下手雷按钮
        const g = this._grenadeBtn;
        if (Math.hypot(p.x - g.x, p.y - g.y) < g.r + 14) { this.grenade = true; continue; }
        // 左半屏: 动态摇杆
        if (p.x < canvas.width / (window.devicePixelRatio || 1) / 2 && this._joyId === null) {
          this._joyId = t.identifier; this._joyOX = p.x; this._joyOY = p.y;
          this._joyDX = 0; this._joyDY = 0;
        } else {
          this.taps.push(p); // 其余触摸视为UI点击
        }
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyId) {
          const p = pos(t);
          const R = 60, dx = p.x - this._joyOX, dy = p.y - this._joyOY;
          const d = Math.hypot(dx, dy) || 1, cl = Math.min(d, R);
          this._joyDX = dx / d * cl / R; this._joyDY = dy / d * cl / R;
        }
      }
    }, { passive: false });
    const endT = e => {
      for (const t of e.changedTouches)
        if (t.identifier === this._joyId) { this._joyId = null; this._joyDX = 0; this._joyDY = 0; }
    };
    canvas.addEventListener('touchend', endT);
    canvas.addEventListener('touchcancel', endT);
    canvas.addEventListener('mousedown', e => {
      const r = canvas.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      const g = this._grenadeBtn;
      if (Math.hypot(p.x - g.x, p.y - g.y) < g.r + 14) this.grenade = true;
      else this.taps.push(p);
    });
  },

  // 每帧调用: 汇总键盘+摇杆
  poll() {
    let x = 0, y = 0;
    const k = this._keys;
    if (k['KeyA'] || k['ArrowLeft']) x -= 1;
    if (k['KeyD'] || k['ArrowRight']) x += 1;
    if (k['KeyW'] || k['ArrowUp']) y -= 1;
    if (k['KeyS'] || k['ArrowDown']) y += 1;
    if (this._joyId !== null) { x = this._joyDX; y = this._joyDY; }
    const d = Math.hypot(x, y);
    if (d > 1) { x /= d; y /= d; }
    this.mx = x; this.my = y;
  },

  consumeTap() { return this.taps.shift(); },
  clearFrame() { this.taps.length = 0; this.pausePressed = false; this.mutePressed = false; },
};
