function emit(target, type, detail) {
  target.dispatchEvent(new CustomEvent(type, { detail }));
}

export class AppManager extends EventTarget {
  constructor(manifests = []) {
    super();
    this.manifests = new Map(manifests.map((app) => [app.id, app]));
    this.activeAppId = 'home';
    this.running = ['home'];
    this.recents = [];
    this.favourites = new Set(['cinema', 'gallery', 'music', 'focus']);
    this.maxRunning = 3;
    this.previousActiveAppId = null;
    try {
      const saved = JSON.parse(globalThis.localStorage?.getItem('pocket-vr-library-v1') || '{}');
      if (Array.isArray(saved.favourites))
        this.favourites = new Set(
          saved.favourites.filter((id) => this.manifests.has(id) && id !== 'home'),
        );
      if (Array.isArray(saved.recents))
        this.recents = [...new Set(saved.recents.filter((id) => this.manifests.has(id)))].slice(
          0,
          8,
        );
    } catch (_) {}
  }

  get active() {
    return this.manifests.get(this.activeAppId) || null;
  }

  getManifest(id) {
    return this.manifests.get(id) || null;
  }

  all() {
    return [...this.manifests.values()];
  }

  launch(id, now = performance.now()) {
    const app = this.manifests.get(id);
    if (!app) return false;
    const isTransientSystem = app.windowType === 'system' && id !== 'home';
    if (isTransientSystem) {
      if (this.activeAppId !== id) this.previousActiveAppId = this.activeAppId;
    } else if (!this.running.includes(id)) {
      if (this.running.length >= this.maxRunning) {
        const removable = this.running.find(
          (runningId) => runningId !== 'home' && runningId !== this.activeAppId,
        );
        if (removable) this.close(removable, now);
      }
      this.running.push(id);
    }
    this.activeAppId = id;
    if (id !== 'home' && !isTransientSystem) {
      this.recents = [id, ...this.recents.filter((item) => item !== id)].slice(0, 8);
    }
    this._save();
    emit(this, 'launch', { id, app, now });
    emit(this, 'focus', { id, app, now });
    return true;
  }

  home(now = performance.now()) {
    this.previousActiveAppId = null;
    return this.launch('home', now);
  }

  focus(id, now = performance.now()) {
    if (!this.running.includes(id)) return false;
    this.activeAppId = id;
    if (id !== 'home')
      this.recents = [id, ...this.recents.filter((item) => item !== id)].slice(0, 8);
    this._save();
    emit(this, 'focus', { id, app: this.manifests.get(id), now });
    return true;
  }

  back(now = performance.now()) {
    if (this.activeAppId === 'home') return false;
    const active = this.manifests.get(this.activeAppId);
    if (
      active?.windowType === 'system' &&
      this.previousActiveAppId &&
      this.running.includes(this.previousActiveAppId)
    ) {
      const target = this.previousActiveAppId;
      this.previousActiveAppId = null;
      return this.focus(target, now);
    }
    return this.home(now);
  }

  close(id, now = performance.now()) {
    if (id === 'home') return false;
    const index = this.running.indexOf(id);
    if (index < 0) return false;
    this.running.splice(index, 1);
    emit(this, 'close', { id, app: this.manifests.get(id), now });
    if (this.activeAppId === id) this.home(now);
    return true;
  }

  closeAll(now = performance.now()) {
    for (const id of [...this.running]) if (id !== 'home') this.close(id, now);
    this.home(now);
  }

  toggleFavourite(id) {
    if (!this.manifests.has(id) || id === 'home') return false;
    if (this.favourites.has(id)) this.favourites.delete(id);
    else this.favourites.add(id);
    this._save();
    return true;
  }

  _save() {
    try {
      globalThis.localStorage?.setItem(
        'pocket-vr-library-v1',
        JSON.stringify({ favourites: [...this.favourites], recents: this.recents }),
      );
    } catch (_) {}
  }
}
