// Показ PDF (pdf.js, локально): усі сторінки однією стрічкою, чітке рендерення під масштаб,
// малюються лише сторінки поруч з екраном. Масштаб рахується відносно «по ширині» (zoom = 1).
import * as pdfjs from '../../lib/pdfjs/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../lib/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const CMAPS = new URL('../../lib/pdfjs/cmaps/', import.meta.url).href;
const FONTS = new URL('../../lib/pdfjs/standard_fonts/', import.meta.url).href;

const GAP = 16, PAD = 24;
const MAX_CANVAS_PIXELS = 16e6;
export const ZOOM_MIN = 0.5, ZOOM_MAX = 4;

export class PdfView {
  constructor(viewEl, pagesEl, { onChange } = {}) {
    this.view = viewEl;
    this.pagesEl = pagesEl;
    this.onChange = onChange || (() => {});
    this.doc = null;
    this.zoom = 1;
    this.slots = [];            // { el, canvas, page, rendered: scale|0, task }
    this.io = new IntersectionObserver((entries) => {
      for (const e of entries) e.target._visible = e.isIntersecting;
      this.scheduleRender();
    }, { root: viewEl, rootMargin: '150% 0px' });
    viewEl.addEventListener('scroll', () => this.onChange());
    new ResizeObserver(() => this.doc && this.applyZoom(this.zoom)).observe(viewEl);
  }

  async open(data) {
    this.close();
    this.doc = await pdfjs.getDocument({ data, cMapUrl: CMAPS, cMapPacked: true, standardFontDataUrl: FONTS }).promise;
    const first = await this.doc.getPage(1);
    this.base = first.getViewport({ scale: 1 });      // розмір сторінки (підручники — однакові сторінки)
    for (let i = 1; i <= this.doc.numPages; i++) {
      const el = document.createElement('div');
      el.className = 'pdf-page';
      el.dataset.page = i;
      this.pagesEl.appendChild(el);
      this.io.observe(el);
      this.slots.push({ el, canvas: null, page: i === 1 ? first : null, rendered: 0, task: null, w: this.base.width, h: this.base.height });
    }
    this.applyZoom(1);
    return this.doc.numPages;
  }

  close() {
    for (const s of this.slots) { s.task?.cancel(); this.io.unobserve(s.el); }
    this.slots = [];
    this.pagesEl.replaceChildren();
    this.doc?.destroy();
    this.doc = null;
  }

  get pageCount() { return this.doc?.numPages || 0; }
  fitScale() { return Math.max(0.1, (this.view.clientWidth - PAD * 2) / this.base.width); }
  get scale() { return this.fitScale() * this.zoom; }
  get canScrollX() { return this.pagesEl.scrollWidth > this.view.clientWidth + 2; }

  // Позиція читання: сторінка + частка її висоти на верхньому краї екрана.
  position() {
    const top = this.view.scrollTop + GAP;          // setPosition лишає GAP над сторінкою
    for (const s of this.slots) {
      const bottom = s.el.offsetTop + s.el.offsetHeight;
      if (bottom > top) return { page: +s.el.dataset.page, frac: Math.max(0, (top - s.el.offsetTop) / s.el.offsetHeight) };
    }
    return { page: 1, frac: 0 };
  }

  setPosition({ page = 1, frac = 0 }) {
    const s = this.slots[Math.min(this.slots.length, Math.max(1, page)) - 1];
    if (s) this.view.scrollTop = s.el.offsetTop + frac * s.el.offsetHeight - GAP;
  }

  applyZoom(zoom) {
    if (!this.doc) return;
    const pos = this.position();
    const cx = (this.view.scrollLeft + this.view.clientWidth / 2) / Math.max(1, this.pagesEl.scrollWidth);
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100));
    const sc = this.scale;
    for (const s of this.slots) {
      s.el.style.width = Math.floor(s.w * sc) + 'px';
      s.el.style.height = Math.floor(s.h * sc) + 'px';
    }
    this.setPosition(pos);
    this.view.scrollLeft = cx * this.pagesEl.scrollWidth - this.view.clientWidth / 2;
    this.scheduleRender();
    this.onChange();
  }

  zoomBy(f) { this.applyZoom(this.zoom * f); }

  goToPage(n) { this.setPosition({ page: n, frac: 0 }); this.onChange(); }

  scheduleRender() {
    clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.renderVisible(), 120);
  }

  async renderVisible() {
    const sc = this.scale;
    for (const s of this.slots) {
      if (!s.el._visible) {
        // далекі сторінки звільняємо, щоб не забивати пам'ять на великих підручниках
        if (s.canvas) { s.task?.cancel(); s.canvas.remove(); s.canvas = null; s.rendered = 0; }
        continue;
      }
      if (Math.abs(s.rendered - sc) < 0.001) continue;
      this.renderSlot(s, sc);
    }
  }

  async renderSlot(s, sc) {
    try {
      s.task?.cancel();
      s.page ||= await this.doc.getPage(+s.el.dataset.page);
      const vp1 = s.page.getViewport({ scale: 1 });
      if (vp1.width !== s.w || vp1.height !== s.h) {      // сторінка іншого розміру
        s.w = vp1.width; s.h = vp1.height;
        s.el.style.width = Math.floor(s.w * sc) + 'px';
        s.el.style.height = Math.floor(s.h * sc) + 'px';
      }
      const vp = s.page.getViewport({ scale: sc });
      let dpr = window.devicePixelRatio || 1;
      if (vp.width * vp.height * dpr * dpr > MAX_CANVAS_PIXELS) dpr = Math.sqrt(MAX_CANVAS_PIXELS / (vp.width * vp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      const task = s.page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
      s.task = task;
      await task.promise;
      // Новий canvas підміняє старий лише коли готовий — без мигання під час масштабування.
      s.canvas?.remove();
      s.el.appendChild(canvas);
      s.canvas = canvas;
      s.rendered = sc;
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') console.error(e);
    }
  }
}
