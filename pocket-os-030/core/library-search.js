export function normalizeSearch(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function appMatchesSearch(app, query) {
  const q = normalizeSearch(query);
  if (!q) return true;
  const haystack = [app?.id, app?.name, app?.category, ...(app?.keywords || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return q.split(' ').every((term) => haystack.includes(term));
}

export function filterLibraryApps(
  apps,
  { filter = 'All', query = '', favourites = new Set(), recents = [] } = {},
) {
  const recentSet = new Set(recents || []);
  const result = (apps || []).filter((app) => {
    if (!app || ['home', 'quick-settings', 'switcher', 'library'].includes(app.id)) return false;
    let categoryMatch = true;
    if (filter === 'Featured') categoryMatch = app.category === 'Featured';
    else if (filter === 'Media')
      categoryMatch =
        ['Media', 'Featured'].includes(app.category) &&
        ['cinema', 'music', 'gallery'].includes(app.id);
    else if (filter === 'Utility') categoryMatch = ['Utility', 'System'].includes(app.category);
    else if (filter === 'Labs') categoryMatch = app.category === 'Labs';
    else if (filter === 'Favourites') categoryMatch = favourites.has(app.id);
    else if (filter === 'Recent') categoryMatch = recentSet.has(app.id);
    return categoryMatch && appMatchesSearch(app, query);
  });
  return filter === 'Recent'
    ? result.sort((a, b) => recents.indexOf(a.id) - recents.indexOf(b.id))
    : result;
}
