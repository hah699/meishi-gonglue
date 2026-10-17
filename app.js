/* 美食攻略 — 主逻辑
 * 数据来源：
 *   img/earth-blue-marble.js / img/earth-dark.js : EARTH_BLUE / EARTH_DARK（base64 内嵌贴图，
 *     仅 file:// 双击打开时由 index.html 条件加载；https 环境直链 img/*.jpg，省 500KB+ 首屏流量）
 *   data.js           : RESTAURANTS（我的美食攻略）
 */
(function () {
  'use strict';

  // 减弱动效偏好（P0：命中时停自转、关涟漪、飞行时长归零）
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 贴图源：file:// 用 base64 全局变量绕跨域；http(s) 直链 jpg（dark 贴图在切换主题时才下载）
  const IS_FILE = location.protocol === 'file:';
  const EARTH_BLUE_SRC = IS_FILE ? window.EARTH_BLUE : 'img/earth-blue-marble.jpg';
  const EARTH_DARK_SRC = IS_FILE ? window.EARTH_DARK : 'img/earth-dark.jpg';

  const container = document.getElementById('globe');

  // —— 刊头计数与空态引导 ——
  document.getElementById('count').textContent = RESTAURANTS.length;
  if (RESTAURANTS.length === 0) {
    document.getElementById('subtitle-tail').hidden = true;
    document.getElementById('guide').hidden = false;
  }

  const labels = []; // 城市标记标签：{ el, inner, d, pos }

  // —— 城市聚合：同城店铺合并为一个城市点（下钻入口）——
  const cityMap = new Map();
  RESTAURANTS.forEach(r => {
    if (!cityMap.has(r.city)) cityMap.set(r.city, []);
    cityMap.get(r.city).push(r);
  });
  const CITIES = Array.from(cityMap, ([name, list]) => ({
    name,
    lat: list.reduce((s, r) => s + r.lat, 0) / list.length,
    lng: list.reduce((s, r) => s + r.lng, 0) / list.length,
    count: list.length,
    restaurants: list,
    offsetY: 0
  }));

  // 距离过近的城市标签垂直错位（广州/深圳在地球上投影太近会叠字）
  for (let i = 0; i < CITIES.length; i++) {
    for (let j = i + 1; j < CITIES.length; j++) {
      const a = CITIES[i], b = CITIES[j];
      const dLng = (a.lng - b.lng) * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180);
      const dLat = a.lat - b.lat;
      if (Math.hypot(dLng, dLat) < 1.2) CITIES[j].offsetY = 30;
    }
  }

  // 标签海拔（地球半径的倍数）
  const LABEL_ALT = 0.03;

  // —— 地球（核心初始化逻辑保持不变）——
  const world = Globe()
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true)
    .atmosphereColor('#5f9bff')
    .globeImageUrl(EARTH_BLUE_SRC)

    // 城市点：脉冲涟漪提示
    .ringsData(REDUCED ? [] : CITIES)
    .ringLat('lat')
    .ringLng('lng')
    .ringAltitude(0.01)
    .ringColor(() => ['rgba(255,140,66,0.9)', 'rgba(255,140,66,0)'])
    .ringMaxRadius(3.4)
    .ringPropagationSpeed(0.6)
    .ringRepeatPeriod(1500)

    // 城市文字标签
    .htmlElementsData(CITIES)
    .htmlLat('lat')
    .htmlLng('lng')
    .htmlAltitude(LABEL_ALT)
    .htmlTransitionDuration(0)
    .htmlElement(buildLabel)

    .onGlobeReady(() => { initLabelPositions(); hideLoading(); });

  // —— 加载指示器：贴图就绪即淡出，10s 兜底防卡死 ——
  const loadingEl = document.getElementById('loading');
  function hideLoading() {
    if (loadingEl) loadingEl.classList.add('done');
  }
  setTimeout(hideLoading, 10000);

  world(container);
  resize();
  window.addEventListener('resize', resize);

  // —— 灯光平衡：默认平行光 0.6π 太猛，雪地/云层会过曝成白斑 ——
  // 换成弱平行光 + 稍强的环境光，整体亮度均匀、暗面细节可见
  world.lights([
    new THREE.AmbientLight(0xffffff, 0.9),
    new THREE.DirectionalLight(0xffffff, 0.28)
  ]);

  const controls = world.controls();
  controls.autoRotate = !REDUCED;
  controls.autoRotateSpeed = 0.35;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 110;
  controls.maxDistance = 900;
  controls.zoomSpeed = 2.5; // 地球滚轮缩放加速
  world.pointOfView({ lat: 34, lng: 104, altitude: 2.2 }, 0);

  // —— 生成标签 ——
  function buildLabel(d) {
    const el = document.createElement('div');
    el.className = 'label-wrap';
    el.innerHTML = '<div class="marker-shift"><div class="marker-inner city-inner" tabindex="0" role="button"><span class="dot"></span><span class="name"></span><span class="count"></span></div></div>';
    const shift = el.querySelector('.marker-shift');
    const inner = el.querySelector('.marker-inner');
    if (d.offsetY) shift.style.transform = 'translateY(' + d.offsetY + 'px)';
    inner.querySelector('.name').textContent = d.name;
    inner.querySelector('.count').textContent = d.count;
    inner.style.pointerEvents = 'auto';
    inner.setAttribute('aria-label', '下钻 ' + d.name + ' · ' + d.count + ' 家餐厅');

    // 拖拽误触防护：按下记坐标，位移 >6px 的 click 忽略
    let downX = 0, downY = 0;
    inner.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; });
    inner.addEventListener('click', e => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      switchToCity(d, inner);
    });
    inner.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        switchToCity(d, inner);
      }
    });

    labels.push({ el: el, inner: inner, d: d, pos: null });
    return el;
  }

  // —— 高德 2D 街道地图层（点城市下钻）——
  const amapView = document.getElementById('amap-view');
  const amapBack = document.getElementById('amap-back');
  let amap = null;        // AMap.Map 实例
  let amapCluster = null; // MarkerCluster 聚合图层
  let amapReady = false;  // 地图是否就绪

  // 惰性加载高德 JS API script（首次下钻才加载，不拖慢地球首屏）
  function loadAMapScript() {
    return new Promise(resolve => {
      if (window.AMap) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://webapi.amap.com/maps?v=2.0&key=23fdf4921431a1a670fb27666e029d03';
      s.onload = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    });
  }

  function initAMap() {
    return new Promise(resolve => {
      if (amapReady) { resolve(); return; }
      loadAMapScript().then(() => {
        if (!window.AMap) { resolve(); return; }
        amap = new AMap.Map('amap-map', { zoom: 12, center: [116.39, 39.9], viewMode: '2D' });
        amapReady = true;
        resolve();
      });
    });
  }

  // 下钻入口：切入高德 2D 街道地图
  function switchToCity(city, markerEl) {
    // 先显示高德层：否则在 display:none 的容器里初始化 map 尺寸为 0，marker 不渲染
    amapView.hidden = false;
    document.querySelector('.header').style.display = 'none';
    document.querySelector('.hint').style.display = 'none';
    document.querySelector('.topbar').style.display = 'none';

    initAMap().then(() => {
      if (!amapReady) return;
      // 销毁旧聚合层，重建（数据在构造时传入，最稳妥）
      if (amapCluster) { amapCluster.setMap(null); amapCluster = null; }
      const points = city.restaurants.map(r => ({ lnglat: [r.lng, r.lat], data: r }));
      amap.plugin(['AMap.MarkerCluster'], () => {
        amapCluster = new AMap.MarkerCluster(amap, points, {
          gridSize: 80,
          maxZoom: 17,
          // 聚合气泡：橙色圆 + 数量
          renderClusterMarker: ctx => {
            ctx.marker.setContent('<div class="amap-cluster-bubble">' + ctx.count + '</div>');
            ctx.marker.setOffset(new AMap.Pixel(-16, -16));
          },
          // 单个店铺：圆点 + 店名（放大到不聚合时显示）
          renderMarker: ctx => {
            const d = ctx.data && ctx.data[0];
            const name = d && d.data ? d.data.name : '';
            ctx.marker.setContent('<div class="amap-pin"><span class="amap-dot"></span><span class="amap-pin-name">' + esc(name) + '</span></div>');
            ctx.marker.setOffset(new AMap.Pixel(-7, -7));
          }
        });
        // 点击：单点开详情，聚合点放大展开
        amapCluster.on('click', e => {
          const data = e.clusterData || [];
          if (data.length <= 1) {
            const r = data[0] && data[0].data;
            if (r) openPanel(r, null);
          } else {
            let lng = 0, lat = 0;
            data.forEach(d => { lng += d.data.lng; lat += d.data.lat; });
            amap.setZoomAndCenter(amap.getZoom() + 2, [lng / data.length, lat / data.length]);
          }
        });
        fitCity(city);
      });
    });
  }

  // 视野适配：单店定位，多店框住全部
  function fitCity(city) {
    const list = city.restaurants;
    if (list.length === 1) {
      amap.setZoomAndCenter(15, [list[0].lng, list[0].lat]);
      return;
    }
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    list.forEach(r => {
      if (r.lng < minLng) minLng = r.lng;
      if (r.lng > maxLng) maxLng = r.lng;
      if (r.lat < minLat) minLat = r.lat;
      if (r.lat > maxLat) maxLat = r.lat;
    });
    amap.setBounds(new AMap.Bounds([minLng, minLat], [maxLng, maxLat]), false, [80, 80, 80, 80]);
  }

  // 返回地球
  function backToGlobe() {
    amapView.hidden = true;
    document.querySelector('.header').style.display = '';
    document.querySelector('.hint').style.display = '';
    document.querySelector('.topbar').style.display = '';
    closePanel();
  }
  amapBack.addEventListener('click', backToGlobe);

  function initLabelPositions() {
    labels.forEach(l => {
      const c = world.getCoords(l.d.lat, l.d.lng, LABEL_ALT);
      l.pos = new THREE.Vector3(c.x, c.y, c.z);
    });
  }

  // 每帧：遮挡判断（标记转到地球背面时隐藏）
  function refreshVisibility() {
    const cam = world.camera().position;
    labels.forEach(l => {
      if (!l.pos) return;
      const p = l.pos;
      const front = (cam.x - p.x) * p.x + (cam.y - p.y) * p.y + (cam.z - p.z) * p.z > 0;
      l.inner.style.display = front ? '' : 'none';
    });
    requestAnimationFrame(refreshVisibility);
  }
  requestAnimationFrame(refreshVisibility);

  function resize() {
    world.width(container.clientWidth).height(container.clientHeight);
  }

  // —— 详情面板 ——
  const panel = document.getElementById('panel');
  const panelBody = document.getElementById('panel-body');
  const panelClose = document.getElementById('panel-close');
  panelClose.addEventListener('click', closePanel);

  let lastMarker = null;   // 焦点归还目标（标记）
  let lastThumb = null;    // 焦点归还目标（缩略图）

  function openPanel(d, markerEl) {
    if (markerEl) lastMarker = markerEl;
    const photos = d.photos || [];

    let photosHtml;
    if (photos.length) {
      photosHtml = '<div class="photos">' + photos.map((src, i) =>
        '<img class="thumb" src="' + esc(src) + '" alt="' + esc(d.name) + ' 照片 ' + (i + 1) + '"' +
        ' data-i="' + i + '" tabindex="0" role="button" loading="lazy" decoding="async">'
      ).join('') + '</div>';
      if (photos.length > 6) {
        photosHtml += '<div class="photos-note">共 ' + photos.length + ' 张 · 点击可放大</div>';
      }
    } else {
      photosHtml = '<div class="photos-empty">照片还没上传，等你补充。</div>';
    }

    const metaParts = [d.city, d.price, d.date].filter(s => s && String(s).trim());
    const metaHtml = metaParts.length
      ? '<div class="p-meta">' + metaParts.map(esc).join(' · ') + '</div>' : '';
    const reviewHtml = d.review && String(d.review).trim()
      ? '<div class="p-review">' + esc(d.review) + '</div>'
      : '<div class="p-review empty">还没有写下评价。</div>';

    // 面板开着点另一个标记：直接换内容，不关再开
    panelBody.innerHTML =
      '<div class="p-label">Review · Food Atlas</div>' +
      '<div class="p-rule"></div>' +
      '<h2 class="p-title">' + esc(d.name) + '</h2>' +
      metaHtml +
      reviewHtml +
      photosHtml;

    panelBody.querySelectorAll('.thumb').forEach(img => {
      img.addEventListener('click', () => openLightbox(photos, parseInt(img.dataset.i, 10), img));
      img.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openLightbox(photos, parseInt(img.dataset.i, 10), img);
        }
      });
      img.addEventListener('error', () => {
        const broken = document.createElement('div');
        broken.className = 'thumb-broken';
        broken.textContent = '照片加载失败';
        img.replaceWith(broken);
      }, { once: true });
    });

    panel.classList.add('open');
    panelClose.focus();
    controls.autoRotate = false;
    world.pointOfView({ lat: d.lat, lng: d.lng, altitude: 1.05 }, REDUCED ? 0 : 800);
  }

  function closePanel() {
    panel.classList.remove('open');
    controls.autoRotate = !REDUCED;
    if (lastMarker) { lastMarker.focus(); lastMarker = null; }
  }

  // —— 照片放大查看 ——
  const lightbox = document.getElementById('lightbox');
  const lbImg = document.getElementById('lb-img');
  const lbCount = document.getElementById('lb-count');
  const lbClose = document.getElementById('lb-close');
  const lbPrevBtn = document.getElementById('lb-prev');
  const lbNextBtn = document.getElementById('lb-next');
  let lbPhotos = [], lbIndex = 0, lbSwitching = false;

  function openLightbox(photos, i, thumbEl) {
    if (thumbEl) lastThumb = thumbEl;
    lbPhotos = photos; lbIndex = i;
    // 只有 1 张照片时不渲染 prev/next（焦点陷阱只含关闭键）
    const multi = photos.length > 1;
    lbPrevBtn.style.display = multi ? '' : 'none';
    lbNextBtn.style.display = multi ? '' : 'none';
    lbImg.src = lbPhotos[lbIndex];
    updateCount();
    lightbox.classList.add('open');
    // 打开时图片 scale .96 → 1
    lbImg.classList.add('is-enter');
    requestAnimationFrame(() => requestAnimationFrame(() => lbImg.classList.remove('is-enter')));
    lbClose.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    if (lastThumb) { lastThumb.focus(); lastThumb = null; }
  }

  function updateCount() {
    lbCount.innerHTML = '<b>' + (lbIndex + 1) + '</b> / ' + lbPhotos.length;
  }

  // 切换：计数器立即更新，旧图 120ms 淡出 → 新图 180ms 淡入
  function renderLb() {
    updateCount();
    if (lbSwitching) return;
    lbSwitching = true;
    lbImg.classList.add('is-out');
    setTimeout(() => {
      lbImg.src = lbPhotos[lbIndex];
      lbImg.classList.remove('is-out');
      lbSwitching = false;
    }, REDUCED ? 0 : 120);
  }

  function lbPrev() { lbIndex = (lbIndex - 1 + lbPhotos.length) % lbPhotos.length; renderLb(); }
  function lbNext() { lbIndex = (lbIndex + 1) % lbPhotos.length; renderLb(); }

  lbClose.addEventListener('click', closeLightbox);
  lbPrevBtn.addEventListener('click', lbPrev);
  lbNextBtn.addEventListener('click', lbNext);
  lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });

  // 灯箱内焦点陷阱：Tab 在可见按钮间循环
  lightbox.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const focusables = [lbClose, lbPrevBtn, lbNextBtn].filter(b => b.style.display !== 'none');
    const idx = focusables.indexOf(document.activeElement);
    e.preventDefault();
    if (e.shiftKey) {
      focusables[(idx - 1 + focusables.length) % focusables.length].focus();
    } else {
      focusables[(idx + 1) % focusables.length].focus();
    }
  });

  // Esc 分层 + 灯箱方向键
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (lightbox.classList.contains('open')) { closeLightbox(); return; }
      if (panel.classList.contains('open')) { closePanel(); return; }
    }
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'ArrowLeft' && lbPhotos.length > 1) lbPrev();
    else if (e.key === 'ArrowRight' && lbPhotos.length > 1) lbNext();
  });

  // —— 地球主题切换 ——
  const themeBtn = document.getElementById('theme-btn');
  const themeBtnText = document.getElementById('theme-btn-text');
  let dark = false;
  themeBtn.addEventListener('click', () => {
    dark = !dark;
    world.globeImageUrl(dark ? EARTH_DARK_SRC : EARTH_BLUE_SRC);
    themeBtnText.textContent = dark ? '明亮版' : '深色版';
    themeBtn.dataset.state = dark ? 'dark' : 'light';
    themeBtn.setAttribute('aria-pressed', String(dark));
  });

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
