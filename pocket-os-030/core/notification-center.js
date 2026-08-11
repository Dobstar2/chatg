export class NotificationCenter {
  constructor() {
    this.items = [];
    this.serial = 0;
  }

  push(message, { kind = 'info', duration = 1800 } = {}, now = performance.now()) {
    this.items.push({ id: ++this.serial, message, kind, createdAt: now, duration });
    if (this.items.length > 3) this.items.shift();
  }

  active(now = performance.now()) {
    this.items = this.items.filter((item) => now - item.createdAt < item.duration);
    return this.items[0] || null;
  }

  clear() {
    this.items = [];
  }
}
