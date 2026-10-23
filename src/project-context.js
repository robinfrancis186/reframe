const destinationKey = 'reframe-destination';
export function readDestination(storage = localStorage) {
  try {
    const data = JSON.parse(storage.getItem(destinationKey) || 'null');
    if (
      data &&
      ['id', 'file', 'point'].every(
        (key) => typeof data[key] === 'string' && data[key].length <= 500,
      )
    )
      return {
        id: data.id,
        file: data.file,
        point: data.point,
        appearance: data.appearance === 'dark' ? 'dark' : 'light',
        adaptBranding: data.adaptBranding !== false,
      };
  } catch {}
  return { id: '', file: '', point: '', appearance: 'light', adaptBranding: true };
}
export function writeDestination(value, storage = localStorage) {
  storage.setItem(
    destinationKey,
    JSON.stringify({
      id: value.id,
      file: value.file,
      point: value.point,
      appearance: value.appearance === 'dark' ? 'dark' : 'light',
      adaptBranding: value.adaptBranding !== false,
    }),
  );
}
export function readProjectBrief(id, storage = localStorage) {
  try {
    const data = JSON.parse(storage.getItem('reframe-brief:' + id) || 'null');
    if (
      data &&
      typeof data.purpose === 'string' &&
      data.purpose.length <= 1500 &&
      typeof data.goal === 'string' &&
      data.goal.length <= 500
    )
      return { purpose: data.purpose, goal: data.goal };
  } catch {}
  return { purpose: '', goal: '' };
}
export function writeProjectBrief(id, value, storage = localStorage) {
  storage.setItem(
    'reframe-brief:' + id,
    JSON.stringify({ purpose: value.purpose, goal: value.goal }),
  );
}
