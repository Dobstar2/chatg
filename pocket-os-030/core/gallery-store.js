import { bounded } from './async.js';
export class GalleryStore {
  constructor() {
    this.items = [];
    this.generation = 0;
    this.queue = Promise.resolve();
  }
  replace(files) {
    this.dispose();
    this.items = files
      .slice(0, 48)
      .map((file) => ({
        name: file.name,
        file,
        url: URL.createObjectURL(file),
        status: 'idle',
        element: null,
      }));
    return this.items;
  }
  ensure(indices) {
    const keep = new Set(indices.filter((i) => i >= 0 && i < this.items.length));
    for (let i = 0; i < this.items.length; i++)
      if (!keep.has(i) && this.items[i].element) {
        this.items[i].element.width = 1;
        this.items[i].element.height = 1;
        this.items[i].element = null;
        this.items[i].status = 'idle';
      }
    this.keep = keep;
    let scheduled = false;
    for (const index of keep) {
      const item = this.items[index];
      if (item.status !== 'idle') continue;
      item.status = 'loading';
      scheduled = true;
      const generation = this.generation;
      this.queue = this.queue.then(async () => {
        if (generation !== this.generation) return;
        if (!this.keep.has(index)) {
          item.status = 'idle';
          return;
        }
        const image = new Image();
        try {
          await bounded(
            new Promise((resolve, reject) => {
              image.onload = resolve;
              image.onerror = () => reject(new Error('Cannot decode photo'));
              image.src = item.url;
            }),
            8000,
          );
          if (generation !== this.generation) return;
          if (!this.keep.has(index)) {
            item.status = 'idle';
            return;
          }
          const ratio = Math.min(1, 1024 / image.naturalWidth, 768 / image.naturalHeight);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          item.element = canvas;
          item.status = 'ready';
        } catch (_) {
          if (generation === this.generation) item.status = 'error';
        } finally {
          image.src = '';
        }
      });
    }
    // A later ensure may run before earlier decodes complete. Evict again after
    // the queue drains, using the latest visible set rather than stale closures.
    this.keep = keep;
    if (scheduled)
      this.queue = this.queue.then(() => {
        for (let i = 0; i < this.items.length; i++) {
          const item = this.items[i];
          if (!this.keep.has(i) && item.element) {
            item.element.width = item.element.height = 1;
            item.element = null;
            item.status = 'idle';
          }
        }
      });
  }
  dispose() {
    this.generation++;
    for (const item of this.items) {
      URL.revokeObjectURL(item.url);
      if (item.element) item.element.width = item.element.height = 1;
    }
    this.items = [];
    this.keep = new Set();
  }
}
