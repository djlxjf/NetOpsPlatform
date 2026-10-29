// webview preload 脚本 - 在加载的页面最早期执行，修正视口高度
(function() {
  if (window.__netopsViewportFixed) return;
  window.__netopsViewportFixed = true;

  function fixViewport() {
    try {
      const h = window.outerHeight || window.innerHeight || screen.availHeight || 900;
      const w = window.outerWidth || window.innerWidth || screen.availWidth || 1400;

      Object.defineProperty(window, 'innerHeight', {
        get: function() { return h; },
        configurable: true
      });
      Object.defineProperty(window, 'innerWidth', {
        get: function() { return w; },
        configurable: true
      });
      Object.defineProperty(window, 'outerHeight', {
        get: function() { return h; },
        configurable: true
      });
      Object.defineProperty(window, 'outerWidth', {
        get: function() { return w; },
        configurable: true
      });

      try {
        Object.defineProperty(document.documentElement, 'clientHeight', {
          get: function() { return h; },
          configurable: true
        });
        Object.defineProperty(document.documentElement, 'clientWidth', {
          get: function() { return w; },
          configurable: true
        });
      } catch(e) {}

      try {
        Object.defineProperty(screen, 'height', {
          get: function() { return h; },
          configurable: true
        });
        Object.defineProperty(screen, 'width', {
          get: function() { return w; },
          configurable: true
        });
        Object.defineProperty(screen, 'availHeight', {
          get: function() { return h; },
          configurable: true
        });
        Object.defineProperty(screen, 'availWidth', {
          get: function() { return w; },
          configurable: true
        });
      } catch(e) {}

      const style = document.createElement('style');
      style.id = '__netops_viewport_style';
      style.textContent = 'html, body { height: 100% !important; min-height: 100% !important; } body { overflow: auto !important; }';
      if (!document.getElementById('__netops_viewport_style')) {
        const target = document.head || document.documentElement;
        if (target) target.appendChild(style);
      }

      window.dispatchEvent(new Event('resize'));
    } catch(e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixViewport);
  } else {
    fixViewport();
  }
  setTimeout(fixViewport, 50);
  setTimeout(fixViewport, 200);
  setTimeout(fixViewport, 500);
})();
