document.addEventListener('DOMContentLoaded', () => {
  // جلوگیری‌های ساده فرانت‌اند؛ امنیت قطعی نیستند.
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('dragstart', (e) => e.preventDefault());
  document.addEventListener('selectstart', (e) => e.preventDefault());

  const $ = (id) => document.getElementById(id);

  const paperWrap = $('paperWrap');
  const pdfMount = $('pdfMount');

  const loading = $('loading');
  const loadingText = $('loadingText');
  const barFill = $('barFill');

  const pageNumEl = $('pageNum');
  const pageCountEl = $('pageCount');

  const btnPrev = $('btnPrev');
  const btnNext = $('btnNext');
  const btnFit = $('btnFit');
  const btnFull = $('btnFull');
  const btnZoomIn = $('btnZoomIn');
  const btnZoomOut = $('btnZoomOut');

  const seek = $('seek');
  const zoomVal = $('zoomVal');
  const status = $('status');

  const PDF_URL = './book.pdf';

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.7.570/pdf.worker.min.js';

  let pdfDoc = null;
  let pageNum = 1;
  let scale = 1;
  let fitToWidth = true;
  let rendering = false;
  let pendingPage = null;
  let toastTimer = null;

  const MIN_SCALE = 0.55;
  const MAX_SCALE = 3;
  const ZOOM_STEP = 0.12;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function showStatus(text, visible = true) {
    status.textContent = text;

    if (!visible) return;

    status.classList.add('show');
    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      status.classList.remove('show');
    }, 1300);
  }

  function setLoading(visible, text = 'در حال بارگذاری…') {
    loading.style.display = visible ? 'flex' : 'none';
    loadingText.textContent = text;
  }

  function updateButtons() {
    btnPrev.disabled = !pdfDoc || pageNum <= 1;
    btnNext.disabled = !pdfDoc || pageNum >= pdfDoc.numPages;
  }

  function calcFitScale(baseViewport) {
    const availableWidth = paperWrap.clientWidth - 16;
    return clamp((availableWidth / baseViewport.width) * 0.985, MIN_SCALE, MAX_SCALE);
  }

  function clearPage() {
    pdfMount.innerHTML = '';
  }

  async function loadPdf() {
    setLoading(true, 'در حال بارگذاری…');
    showStatus('بارگذاری', false);
    barFill.style.width = '0%';

    const task = pdfjsLib.getDocument({
      url: PDF_URL,
      disableAutoFetch: false,
      disableStream: false,
      disableRange: false
    });

    task.onProgress = (progress) => {
      if (!progress || !progress.total) return;

      const percent = clamp((progress.loaded / progress.total) * 100, 0, 100);

      barFill.style.width = `${percent.toFixed(1)}%`;
      loadingText.textContent = `در حال بارگذاری… ${percent.toFixed(0)}%`;
    };

    pdfDoc = await task.promise;

    pageNum = 1;

    pageCountEl.textContent = String(pdfDoc.numPages);
    pageNumEl.textContent = String(pageNum);

    seek.min = '1';
    seek.max = String(pdfDoc.numPages);
    seek.value = String(pageNum);

    await renderPage(pageNum);

    setLoading(false);
    showStatus('آماده');
  }

  async function renderPage(num) {
    if (!pdfDoc) return;

    if (rendering) {
      pendingPage = num;
      return;
    }

    rendering = true;

    try {
      pageNum = clamp(num, 1, pdfDoc.numPages);

      pageNumEl.textContent = String(pageNum);
      seek.value = String(pageNum);

      updateButtons();

      const page = await pdfDoc.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });

      if (fitToWidth) {
        scale = calcFitScale(baseViewport);
      } else {
        scale = clamp(scale, MIN_SCALE, MAX_SCALE);
      }

      zoomVal.textContent = String(Math.round(scale * 100));

      const viewport = page.getViewport({ scale });

      clearPage();

      const pageBox = document.createElement('div');
      pageBox.className = 'pdfPage';
      pageBox.style.width = `${viewport.width}px`;
      pageBox.style.height = `${viewport.height}px`;

      const canvas = document.createElement('canvas');
      canvas.className = 'pdfCanvas';

      const ctx = canvas.getContext('2d', { alpha: false });

      // برای موبایل DPR را محدود می‌کنیم تا هم واضح باشد هم کند نشود.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);

      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;

      const textLayer = document.createElement('div');
      textLayer.className = 'textLayer';
      textLayer.style.width = `${viewport.width}px`;
      textLayer.style.height = `${viewport.height}px`;

      pageBox.appendChild(canvas);
      pageBox.appendChild(textLayer);
      pdfMount.appendChild(pageBox);

      await page.render({
        canvasContext: ctx,
        viewport,
        transform,
        intent: 'display'
      }).promise;

      // لایه متن؛ برای بعضی PDFهای فارسی کمک می‌کند.
      try {
        const textContent = await page.getTextContent();

        pdfjsLib.renderTextLayer({
          textContent,
          container: textLayer,
          viewport,
          textDivs: []
        });
      } catch (_) {
        // اگر textLayer خطا داد، خود canvas همچنان نمایش داده می‌شود.
      }

      // بعد از رندر، صفحه را بالا ببرد.
      paperWrap.scrollTop = 0;
      paperWrap.scrollLeft = 0;
    } catch (err) {
      console.error(err);
      showStatus('خطا در نمایش صفحه');
    } finally {
      rendering = false;

      if (pendingPage !== null) {
        const next = pendingPage;
        pendingPage = null;
        renderPage(next);
      }
    }
  }

  function go(delta) {
    if (!pdfDoc) return;
    renderPage(pageNum + delta);
  }

  btnPrev.addEventListener('click', () => go(-1));
  btnNext.addEventListener('click', () => go(1));

  btnFit.addEventListener('click', () => {
    fitToWidth = true;
    renderPage(pageNum);
    showStatus('فیت به عرض');
  });

  btnZoomIn.addEventListener('click', () => {
    fitToWidth = false;
    scale = clamp(scale + ZOOM_STEP, MIN_SCALE, MAX_SCALE);
    renderPage(pageNum);
    showStatus(`زوم ${Math.round(scale * 100)}٪`);
  });

  btnZoomOut.addEventListener('click', () => {
    fitToWidth = false;
    scale = clamp(scale - ZOOM_STEP, MIN_SCALE, MAX_SCALE);
    renderPage(pageNum);
    showStatus(`زوم ${Math.round(scale * 100)}٪`);
  });

  seek.addEventListener('input', () => {
    const target = parseInt(seek.value, 10);
    renderPage(target);
  });

  btnFull.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        showStatus('تمام‌صفحه');
      } else {
        await document.exitFullscreen();
        showStatus('خروج از تمام‌صفحه');
      }
    } catch (_) {
      showStatus('تمام‌صفحه پشتیبانی نشد');
    }
  });

  window.addEventListener('resize', () => {
    if (fitToWidth && pdfDoc) {
      renderPage(pageNum);
    }
  });

  // کلیدهای دسکتاپ
  document.addEventListener(
    'keydown',
    (e) => {
      const key = (e.key || '').toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;

      if (e.keyCode === 123) {
        e.preventDefault();
        return;
      }

      if (ctrl && e.shiftKey && ['i', 'c', 'j'].includes(key)) {
        e.preventDefault();
        return;
      }

      if (ctrl && ['c', 's', 'p', 'u', 'a'].includes(key)) {
        e.preventDefault();
        return;
      }

      if (key === 'arrowleft') {
        e.preventDefault();
        go(-1);
      }

      if (key === 'arrowright') {
        e.preventDefault();
        go(1);
      }
    },
    { passive: false }
  );

  // سوایپ موبایل برای ورق زدن
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;

  paperWrap.addEventListener(
    'touchstart',
    (e) => {
      if (!e.touches || !e.touches[0]) return;

      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    },
    { passive: true }
  );

  paperWrap.addEventListener(
    'touchend',
    (e) => {
      if (!e.changedTouches || !e.changedTouches[0]) return;

      touchEndX = e.changedTouches[0].clientX;
      touchEndY = e.changedTouches[0].clientY;

      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;

      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      // فقط سوایپ افقی واضح
      if (absX < 70 || absX < absY * 1.4) return;

      // در RTL:
      // کشیدن به چپ => صفحه بعد
      // کشیدن به راست => صفحه قبل
      if (dx < 0) {
        go(1);
      } else {
        go(-1);
      }
    },
    { passive: true }
  );

  loadPdf().catch((err) => {
    console.error(err);
    setLoading(true, 'خطا در بارگذاری فایل کتاب');
    barFill.style.width = '0%';
    showStatus('خطا');
  });
});
