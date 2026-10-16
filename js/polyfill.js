// 兼容垫片: 必须第一个加载
// 1. roundRect (老版本 Safari/微信 webview 没有)
// 2. 全局报错显示: 出错时把信息写进 #bootmsg, 方便定位
(function () {
  if (typeof CanvasRenderingContext2D !== 'undefined' &&
      !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      r = Math.min(r || 0, w / 2, h / 2);
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  }
  window.addEventListener('error', function (e) {
    var el = document.getElementById('bootmsg');
    if (el) {
      el.style.display = 'flex';
      el.innerHTML = '启动出错：<br>' + String((e && e.message) || e).slice(0, 200) +
        '<br><br>请把这段话发给 Muse。';
    }
  });
})();
