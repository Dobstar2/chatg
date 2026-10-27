// The public entry reports local module failures without blocking on optional ML.
let timer;
Promise.race([
  import('./app-c2.js?v=pocket-1rc1'),
  new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Startup timeout')), 9000);
  }),
])
  .catch(() => {
    document.getElementById('startStatus').textContent =
      'Pocket VR could not load. Check your connection, then reload.';
    document.getElementById('enterButton').hidden = true;
    document.getElementById('screenButton').hidden = true;
    const reload = document.createElement('button');
    reload.textContent = 'Reload Pocket VR';
    reload.id = 'reloadApp';
    reload.onclick = () => location.reload();
    document.querySelector('.welcome-actions').append(reload);
  })
  .finally(() => clearTimeout(timer));
