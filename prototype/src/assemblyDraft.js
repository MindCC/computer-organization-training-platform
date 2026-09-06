import { HARDWARE_PARTS } from './hardwareGame.js';
import { reconcileInstallation } from './hardwareAssembly.js';

const DRAFT_VERSION = 1;
const SELECTION_KEYS = ['cpu', 'memory', 'storage', 'gpu'];

export function assemblyDraftKey(userId, caseId) {
  const user = validIdentity(userId);
  const order = validIdentity(caseId);
  if (!user || !order) return null;
  return `zcyl:assembly-draft:v1:${encodeURIComponent(user)}:${encodeURIComponent(order)}`;
}

export function loadAssemblyDraft(storage, key, selection) {
  const payload = readPayload(storage, key);
  if (!payload || !canonicalSelection(payload.selection)) return {};
  if (!payload.installed || typeof payload.installed !== 'object' || Array.isArray(payload.installed)) return {};
  return reconcileInstallation(payload.installed, selection ?? {});
}

export function saveAssemblyDraft(storage, key, installed, selection) {
  if (!storage || typeof storage.setItem !== 'function' || typeof key !== 'string' || !key) return false;
  const savedSelection = canonicalSelection(selection);
  if (!savedSelection) return false;

  const payload = {
    version: DRAFT_VERSION,
    selection: savedSelection,
    installed: reconcileInstallation(installed ?? {}, savedSelection),
  };

  try {
    storage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function readAssemblyDraftSelection(storage, key, fallbackSelection) {
  const fallback = canonicalSelection(fallbackSelection) ?? {};
  const payload = readPayload(storage, key);
  return canonicalSelection(payload?.selection) ?? fallback;
}

function readPayload(storage, key) {
  if (!storage || typeof storage.getItem !== 'function' || typeof key !== 'string' || !key) return null;
  try {
    const raw = storage.getItem(key);
    if (typeof raw !== 'string') return null;
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.version !== DRAFT_VERSION) return null;
    return payload;
  } catch {
    return null;
  }
}

function canonicalSelection(selection) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return null;
  const entries = SELECTION_KEYS.map((category) => {
    const variant = selection[category];
    return HARDWARE_PARTS[category].some((part) => part.id === variant) ? [category, variant] : null;
  });
  return entries.every(Boolean) ? Object.fromEntries(entries) : null;
}

function validIdentity(value) {
  if (Number.isSafeInteger(value) && value > 0) return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
