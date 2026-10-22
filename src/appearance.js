export function loadAppearance(storage){
  try{return (storage??globalThis.localStorage)?.getItem('reframe-appearance')==='light'?'light':'dark';}catch{return 'dark';}
}
export function setAppearance(value){
  const appearance=value==='light'?'light':'dark';
  document.documentElement.dataset.appearance=appearance;
  try{localStorage.setItem('reframe-appearance',appearance);}catch{/* Appearance still works without browser storage. */}
}
