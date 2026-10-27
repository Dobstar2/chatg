import { filterLibraryApps } from '../core/library-search.js';

export const CORE_APPS = [
  'cinema',
  'gallery',
  'music',
  'focus',
  'planetarium',
  'portal',
  'environments',
  'clock',
];
export const ENVIRONMENTS = [
  ['glass', 'Studio'],
  ['space', 'Observatory'],
  ['ocean', 'Ocean'],
];
export function createLayout(s) {
  const app = s.appManager.activeAppId;
  const layout = {
    title: s.appManager.active?.name || 'Pocket VR',
    subtitle: '',
    controls: [],
    lines: [],
    stage: app,
    panel: true,
  };
  const add = (id, label, x, y, w = 0.52, h = 0.19, extra = {}) => {
    layout.controls.push({
      id,
      action: id,
      label,
      position: { x, y, z: -1.65 },
      width: w,
      height: h,
      angularRadius: Math.min(w, h) / 3.3,
      ...extra,
    });
  };
  const rows = (entries) =>
    entries.forEach(([id, text, extra], i) =>
      add(id, text, i % 2 ? 0.44 : -0.44, 0.26 - Math.floor(i / 2) * 0.27, 0.8, 0.21, extra),
    );
  const grid = (items, prefix = 'app:', page = 0) =>
    items.slice(page * 6, page * 6 + 6).forEach((item, i) => {
      const id = typeof item === 'string' ? item : item.id;
      const manifest = s.appManager.getManifest(id);
      add(
        prefix + id,
        manifest?.name || item.name || id,
        -0.59 + (i % 3) * 0.59,
        0.2 - Math.floor(i / 3) * 0.38,
        0.53,
        0.32,
        { icon: id, kind: 'app' },
      );
    });
  const pages = (prefix, page, total) => {
    add(prefix + ':prev', 'Previous', -0.58, -0.51, 0.45, 0.15, { disabled: page <= 0 });
    add(prefix + ':next', 'Next', 0.58, -0.51, 0.45, 0.15, { disabled: (page + 1) * 6 >= total });
    layout.page = `${page + 1} / ${Math.max(1, Math.ceil(total / 6))}`;
  };
  if (s.windowTools && s.windows.windows.has(app)) {
    layout.title = 'Arrange window';
    layout.stage = 'window-tools';
    layout.subtitle = s.windows.windows.get(app).pinned
      ? 'Pinned in place'
      : 'Changes apply to the app surface';
    rows(
      [
        [`window:move:${app}`, s.windows.manipulation ? 'Place here' : 'Move · look, then tap'],
        [`window:resize:${app}`, 'Hold to resize'],
        [`window:smaller:${app}`, 'Smaller'],
        [`window:larger:${app}`, 'Larger'],
        [`window:pin:${app}`, s.windows.windows.get(app).pinned ? 'Unpin' : 'Pin'],
        [`window:close:${app}`, 'Close app'],
      ].map((row) => [
        row[0],
        row[1],
        {
          disabled: s.windows.windows.get(app).pinned && /move|resize|smaller|larger/.test(row[0]),
        },
      ]),
    );
    ['left', 'center', 'right'].forEach((slot, i) =>
      add(
        `window:snap-${slot}:${app}`,
        slot === 'center' ? 'Centre' : slot[0].toUpperCase() + slot.slice(1),
        (i - 1) * 0.56,
        -0.53,
        0.49,
        0.15,
        { disabled: s.windows.windows.get(app).pinned },
      ),
    );
  } else if (s.tutorial) {
    layout.title = s.tutorial.done ? 'You have it.' : 'A little practice';
    layout.subtitle =
      s.mode === 'headset'
        ? 'Look at the circle. It lights up.'
        : 'Tap the circle. Drag empty space to look.';
    layout.stage = 'tutorial';
    layout.lines = s.tutorial.done
      ? ['Look → highlight → pinch or tap.', 'Hold the screen for Home. Recenter is below.']
      : ['Then pinch or tap anywhere to select.', 'Camera is optional. Try it later in Settings.'];
    add('tutorial:target', s.tutorial.done ? 'Well done' : 'Select me', 0, 0.1, 0.54, 0.33, {
      icon: 'focus',
    });
    add(
      'tutorial:finish',
      s.tutorial.done ? 'Make yourself at home' : 'Skip tutorial',
      0,
      -0.49,
      1.2,
      0.2,
    );
  } else if (app === 'home') {
    layout.title = 'Make room for you.';
    layout.subtitle = 'POCKET VR   /   YOUR PERSONAL SPACE';
    const selected = [...s.appManager.recents, ...s.appManager.favourites, ...CORE_APPS]
      .filter(
        (id, i, all) =>
          all.indexOf(id) === i &&
          !['home', 'library', 'settings', 'system-info', 'tracking-lab', 'labs'].includes(id),
      )
      .slice(0, 6);
    grid(selected);
    layout.subtitle = s.appManager.recents.length ? 'RECENT & FAVOURITES' : 'A FEW PLACES TO BEGIN';
    add('app:environments', 'Change the scenery', -0.37, -0.53, 0.99, 0.17, {
      icon: 'environments',
      kind: 'inline',
    });
    add('app:library', 'All apps', 0.59, -0.53, 0.55, 0.17);
  } else if (app === 'library') {
    const l = s.apps.library;
    const apps = filterLibraryApps(s.appManager.all(), {
      ...l,
      favourites: s.appManager.favourites,
      recents: s.appManager.recents,
    });
    l.page = Math.min(l.page || 0, Math.max(0, Math.ceil(apps.length / 6) - 1));
    layout.subtitle = l.query ? `Results for “${l.query}”` : `${l.filter} · ${apps.length} apps`;
    layout.title = 'Your library';
    grid(apps, 'app:', l.page);
    // App labels and favourite controls occupy separate, non-overlapping regions.
    layout.controls.forEach((t) => {
      t.height = 0.25;
      t.position.y += 0.025;
    });
    apps
      .slice(l.page * 6, l.page * 6 + 6)
      .forEach((item, i) =>
        add(
          `library:favourite:${item.id}`,
          s.appManager.favourites.has(item.id) ? 'Saved' : '+ Save',
          -0.59 + (i % 3) * 0.59,
          0.015 - Math.floor(i / 3) * 0.38,
          0.43,
          0.09,
          { kind: 'small' },
        ),
      );
    pages('library:page', l.page, apps.length);
    add('library:filter-cycle', l.filter, -0.44, 0.5, 0.78, 0.15);
    add('library:search', 'Search', 0.44, 0.5, 0.78, 0.15);
    if (!apps.length)
      layout.lines = [
        'Nothing here yet.',
        l.filter === 'Favourites'
          ? 'Save apps from All to collect them here.'
          : 'Try another category or search.',
      ];
  } else if (app === 'settings') {
    layout.title = 'Make it comfortable';
    const page = s.apps.settings?.page || 0;
    layout.subtitle = ['CONTROLS', 'APPEARANCE', 'SYSTEM'][page];
    const p = s.settings;
    const entries =
      page === 0
        ? [
            ['settings:selection', `Confirm · ${p.selectionMethod}`],
            ['settings:assist', `Aim assist · ${Math.round(p.assist * 100)}%`],
            ['settings:hold', `Hold · ${p.holdMs} ms`],
            ['settings:stickiness', `Sticky · ${p.stickinessMs} ms`],
            ['settings:camera', s.handsReady ? 'Turn camera off' : 'Enable pinch camera'],
            ['settings:motion-retry', 'Enable head motion'],
          ]
        : page === 1
          ? [
              ['settings:motion', `Reduce motion · ${p.reduceMotion ? 'On' : 'Off'}`],
              ['settings:transparency', `Solid surfaces · ${p.reduceTransparency ? 'On' : 'Off'}`],
              ['settings:contrast', `High contrast · ${p.highContrast ? 'On' : 'Off'}`],
              ['settings:brightness', `Room light · ${Math.round(p.worldBrightness * 100)}%`],
              ['app:environments', 'Choose environment'],
              ['settings:align', 'View alignment'],
            ]
          : [
              ['settings:performance', `Quality · ${s.performance.mode}`],
              ['settings:sound', `UI sound · ${p.uiSound ? 'On' : 'Off'}`],
              ['settings:tutorial', 'Replay tutorial'],
              ['app:system-info', 'About & privacy'],
              ['settings:reset', 'Reset preferences'],
              ['system:exit', 'Exit headset'],
            ];
    rows(entries);
    add('settings:page', ['Appearance →', 'System →', 'Controls →'][page], 0, -0.56, 1.2, 0.16);
  } else if (app === 'alignment') {
    layout.title = 'Find a comfortable view';
    layout.subtitle = 'Seated, facing forward · adjust one step at a time';
    layout.stage = 'alignment';
    rows([
      ['align:scale-down', 'View −'],
      ['align:scale-up', 'View +'],
      ['align:eyes-down', 'Separation −'],
      ['align:eyes-up', 'Separation +'],
      ['align:reset', 'Reset alignment'],
      ['system:recenter', 'Recenter'],
    ]);
    layout.lines = ['Software adjustments cannot correct every lens.'];
  } else if (app === 'quick-settings') {
    layout.title = 'Take a moment';
    layout.subtitle = 'QUICK SETTINGS';
    rows([
      ['system:recenter', 'Recenter view'],
      ['app:environments', 'Change scenery'],
      ['app:switcher', 'Open apps'],
      ['app:settings', 'Settings'],
      ['settings:camera', s.handsReady ? 'Camera off' : 'Enable pinch'],
      ['system:exit', 'Exit headset'],
    ]);
  } else if (app === 'switcher') {
    layout.title = 'Pick up where you left off';
    layout.subtitle = 'Up to two apps plus Home';
    const running = s.appManager.running.filter((id) => id !== 'home');
    running.forEach((id, i) => {
      add(
        `switcher:focus:${id}`,
        s.appManager.getManifest(id)?.name,
        i ? 0.45 : -0.45,
        0.16,
        0.78,
        0.53,
        { icon: id, kind: 'preview', previewId: id },
      );
      add(`switcher:close:${id}`, 'Close', i ? 0.45 : -0.45, -0.26, 0.65, 0.18);
    });
    if (!running.length) layout.lines = ['Your space is clear.', 'Open an app from the Library.'];
  } else if (app === 'cinema') {
    layout.panel = false;
    layout.title = 'Pocket Cinema';
    layout.subtitle = 'Local films · use iPhone buttons for volume';
    const c = s.apps.cinema;
    if (c.controlsVisible || !s.media.videoReady) {
      const entries =
        c.panel === 'picture'
          ? [
              ['cinema:format', c.format.toUpperCase()],
              ['cinema:size', 'Screen size'],
              ['cinema:distance', 'Distance'],
              ['cinema:environment', `Room · ${c.environment}`],
              ['cinema:brightness', 'Room light'],
              ['cinema:panel', 'Playback →'],
            ]
          : [
              ['cinema:open', 'Choose video'],
              ['cinema:play', s.media.videoPlaying ? 'Pause' : 'Play'],
              ['cinema:fixture', 'Stereo test'],
              ['cinema:seek-back', '−10 seconds'],
              ['cinema:seek-forward', '+10 seconds'],
              ['cinema:panel', 'Picture →'],
            ];
      entries.forEach(([id, label], i) =>
        add(id, label, -0.59 + (i % 3) * 0.59, -0.38 - Math.floor(i / 3) * 0.23, 0.53, 0.18),
      );
      add('cinema:controls', 'Hide controls', 0.6, 0.68, 0.57, 0.16);
      add('cinema:seek-percent:25', '25%', -0.52, -0.12, 0.35, 0.13, {
        disabled: !s.media.videoReady,
      });
      add('cinema:seek-percent:50', '50%', 0, -0.12, 0.35, 0.13, { disabled: !s.media.videoReady });
      add('cinema:seek-percent:75', '75%', 0.52, -0.12, 0.35, 0.13, {
        disabled: !s.media.videoReady,
      });
    } else add('cinema:controls', 'Show controls', 0.55, -0.61, 0.8, 0.18);
  } else if (app === 'gallery') {
    layout.title = 'A place for your photographs';
    const g = s.apps.gallery,
      count = s.media.images.length;
    layout.subtitle = count
      ? `${g.mode} · ${g.selectedIndex + 1} of ${count}`
      : 'Private, local photos · reselect after reloading';
    if (g.mode === 'Grid' && count) {
      g.page = Math.min(g.page || 0, Math.ceil(count / 6) - 1);
      s.media.images
        .slice(g.page * 6, g.page * 6 + 6)
        .forEach((image, i) =>
          add(
            `gallery:image:${g.page * 6 + i}`,
            image.name,
            -0.59 + (i % 3) * 0.59,
            0.25 - Math.floor(i / 3) * 0.34,
            0.53,
            0.29,
            { kind: 'photo', image },
          ),
        );
    }
    if (!count)
      layout.lines = [
        'Your photos, with room to breathe.',
        'Choose up to 48 photos. They stay on this device.',
      ];
    [
      ['gallery:open', 'Photos'],
      ['gallery:mode', g.mode],
      ['gallery:prev', 'Previous'],
      ['gallery:next', 'Next'],
    ].forEach(([id, label], i) =>
      add(id, label, -0.66 + i * 0.44, -0.53, 0.4, 0.17, {
        disabled: !count && /prev|next/.test(id),
      }),
    );
  } else if (app === 'music') {
    layout.panel = false;
    layout.title = 'Music Room';
    [
      ['music:open', 'Choose audio'],
      ['music:play', s.media.audioPlaying ? 'Pause' : 'Play'],
      ['music:mode', s.apps.music.mode],
    ].forEach(([id, text], i) => add(id, text, (i - 1) * 0.59, -0.53));
  } else if (app === 'focus') {
    layout.title = 'A little space to focus';
    layout.subtitle = s.apps.focus.running ? 'ONE THING AT A TIME' : 'YOUR NEXT QUIET MOMENT';
    [
      [
        'focus:toggle',
        s.apps.focus.running ? 'Pause' : s.apps.focus.remainingMs ? 'Start' : 'Start again',
      ],
      ['focus:duration', `${s.apps.focus.durationMinutes} min`],
      ['focus:reset', 'Reset'],
    ].forEach(([id, text], i) => add(id, text, (i - 1) * 0.59, -0.5));
  } else if (app === 'environments') {
    layout.title = 'Somewhere you can settle';
    layout.subtitle = 'THREE PLACES, ONE CALM SPACE';
    ENVIRONMENTS.forEach(([id, name], i) =>
      add('environment:set:' + id, name, (i - 1) * 0.59, 0.05, 0.53, 0.57, {
        kind: 'environment',
        environment: id,
      }),
    );
    layout.lines = ['Your viewpoint stays still. The scenery changes.'];
  } else if (app === 'clock') {
    layout.title = 'Time, unhurried';
    layout.subtitle = new Date().toLocaleDateString([], {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    add('app:focus', 'Make time to focus', 0, -0.5, 1.2);
  } else if (app === 'browser') {
    layout.title = 'A window to the web';
    layout.subtitle = 'EXTERNAL SITE LAUNCHER';
    layout.lines = [
      'Enter an address in the native bar below.',
      'The website opens in a separate browser tab.',
      'Return here to continue your space.',
    ];
  } else if (app === 'system-info') {
    layout.title = 'Pocket VR';
    layout.subtitle = s.build;
    layout.lines = [
      'Your media and camera frames stay on device.',
      'Optional tracking downloads MediaPipe + a model.',
      'No account, backend or candidate service worker.',
      'Headset comfort still needs iPhone acceptance.',
    ];
  } else if (app === 'tracking-lab') {
    layout.title = 'Tracking diagnostics';
    layout.subtitle = 'MEASURED ON THIS BROWSER';
    layout.lines = [
      `Render: ${s.performance.fps} fps · ${s.performance.mode}`,
      `Inference: ${Number(s.trackingMetrics.inferenceMs || 0).toFixed(1)} ms`,
      `Head samples: ${s.motionTracking ? 'arriving' : 'waiting / drag fallback'}`,
      `Camera: ${s.cameraState} · ${s.handsReady ? 'pinch enabled' : 'touch active'}`,
    ];
    add('tracking:restart', 'Retry hand tracking', 0, -0.51, 1.3);
  } else if (app === 'labs') {
    layout.title = 'Small experiments';
    layout.subtitle = 'LABS · ILLUSTRATIVE, NOT SCIENTIFIC';
    grid(['hologram', 'mini-worlds', 'tracking-lab']);
    layout.lines = ['Explore simple models and miniature dioramas.'];
  } else if (app === 'planetarium') {
    layout.panel = false;
    layout.title = 'An evening among planets';
    layout.subtitle = 'Illustrative scale and orbits';
    const planets = s.planetPositions || [];
    if (!s.apps.planetarium.focus) {
      for (const p of planets)
        layout.controls.push({
          id: 'planet:' + p.id,
          action: 'planet:' + p.id,
          label: p.name,
          position: p.position,
          width: p.radius * 2,
          height: p.radius * 2,
          angularRadius: p.radius / 2.5,
          kind: 'planet',
          planet: p,
        });
      [
        ['planetarium:pause', s.apps.planetarium.paused ? 'Resume' : 'Pause'],
        ['planetarium:speed', `${s.apps.planetarium.timeScale}× time`],
        ['planetarium:reset', 'Reset'],
      ].forEach(([id, text], i) => add(id, text, (i - 1) * 0.59, -0.57));
    } else add('planetarium:focus-back', 'Solar system', 0, -0.57, 1.2);
  } else if (app === 'portal') {
    layout.title = 'A doorway to somewhere else';
    layout.subtitle = 'Stay seated. Explore with your gaze.';
    if (!s.apps.portal.selected)
      ['space', 'ocean', 'glass'].forEach((id, i) =>
        add(
          'portal:' + id,
          ENVIRONMENTS.find((e) => e[0] === id)?.[1],
          (i - 1) * 0.59,
          0,
          0.53,
          0.65,
          { kind: 'environment', environment: id },
        ),
      );
    else {
      layout.panel = false;
      add('portal:return', 'Back to portals', 0, -0.57, 1.2);
      layout.lines = [
        s.apps.portal.selected === 'ocean'
          ? 'A low sun over a quiet horizon.'
          : s.apps.portal.selected === 'space'
            ? 'A ringed world beyond the observatory.'
            : 'Warm light. Open space. A place to pause.',
      ];
    }
  } else if (app === 'hologram') {
    layout.title = 'Objects in light';
    layout.subtitle = `${s.apps.hologram.model} · procedural study`;
    [
      ['holo:left', 'Rotate −'],
      ['holo:model', 'Model'],
      ['holo:right', 'Rotate +'],
      ['holo:zoom', 'Zoom'],
      ['holo:auto', s.apps.hologram.auto ? 'Pause spin' : 'Auto spin'],
      ['holo:wire', s.apps.hologram.wireframe ? 'Solid' : 'Wireframe'],
    ].forEach(([id, text], i) =>
      add(id, text, -0.59 + (i % 3) * 0.59, -0.31 - Math.floor(i / 3) * 0.23),
    );
  } else if (app === 'mini-worlds') {
    layout.title = 'Worlds in miniature';
    layout.subtitle = s.apps.miniWorlds.expanded
      ? 'Look around the expanded diorama'
      : 'Select a scene to expand it';
    if (s.apps.miniWorlds.expanded) add('world:collapse', 'Back to the shelf', 0, -0.55, 1.2);
    else
      ['city', 'island', 'forest'].forEach((id, i) =>
        add('world:' + id, id[0].toUpperCase() + id.slice(1), (i - 1) * 0.59, 0, 0.53, 0.57, {
          kind: 'world',
          world: id,
        }),
      );
  } else if (app === 'arcade') {
    layout.title = 'Target Rush';
    layout.subtitle = '30 seconds · look, highlight, select';
    layout.panel = false;
    const game = s.apps.arcade;
    if (game.phase === 'playing') {
      for (const orb of game.orbs.filter((o) => o.active))
        layout.controls.push({
          id: 'arcade:' + orb.id,
          action: 'arcade:' + orb.id,
          label: 'Target',
          position: { x: orb.x, y: orb.y, z: orb.z },
          width: orb.radius * 2,
          height: orb.radius * 2,
          angularRadius: orb.radius / 2,
          kind: 'orb',
        });
    } else {
      layout.lines =
        game.phase === 'finished'
          ? [`${game.score} targets. Nicely done.`, 'Take a breath, then try again.']
          : ['Select as many lights as you can.', 'Each deliberate pinch or tap scores once.'];
      add('arcade:restart', game.phase === 'finished' ? 'Play again' : 'Start round', 0, -0.4, 1.2);
    }
  } else if (app === 'passthrough') {
    layout.panel = false;
    layout.title = 'A quick look outside';
    layout.subtitle = 'MONO CAMERA · STAY SEATED';
    layout.lines = [s.cameraError || 'A delayed camera feed is not a navigation aid.'];
    add('passthrough:retry', 'Enable / retry camera', -0.44, -0.5, 0.8);
    add('system:home', 'Return to VR', 0.44, -0.5, 0.8);
  }
  // One stable, reachable system dock. It is outside movable app surfaces.
  const dock = [
    ['system:home', 'Home', 'home'],
    ['app:library', 'Library', 'library'],
    ['app:quick-settings', 'Controls', 'settings'],
    ['system:recenter', 'Recenter', 'focus'],
  ];
  dock.forEach(([id, label, icon], i) =>
    add(id, label, -0.675 + i * 0.45, -0.89, 0.4, 0.22, { icon, kind: 'dock', system: true }),
  );
  if (s.windows.windows.has(app) && !s.tutorial)
    add('system:window-tools', s.windowTools ? 'Done' : 'Arrange', 0.64, 0.83, 0.47, 0.13, {
      system: true,
    });
  // Apply the same transform to rendered content and all its interactive bounds.
  const win = !s.windowTools && !s.tutorial ? s.windows.windows.get(app) : null;
  if (win) {
    layout.surface = win;
    for (const t of layout.controls)
      if (!t.system) {
        t.position = {
          x: win.position.x + t.position.x * win.scale,
          y: win.position.y + t.position.y * win.scale,
          z: win.position.z,
        };
        t.width *= win.scale;
        t.height *= win.scale;
      }
  }
  return layout;
}
