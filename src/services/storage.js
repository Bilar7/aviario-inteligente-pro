const mem = Object.create(null);
const key = 'aviario';
function store(){ try { return window.localStorage; } catch { return null; } }
export function getItem(k){ const s=store(); try { const v=s?.getItem(k); if(v!==null) return v; } catch {} return mem[k] ?? null; }
export function setItem(k,v){ const value=String(v); mem[k]=value; try { store()?.setItem(k,value); } catch {} return value; }
export function removeItem(k){ delete mem[k]; try { store()?.removeItem(k); } catch {} }
export const STORAGE_PREFIX = key;

export const SafeStorage = { getItem, setItem, removeItem };
