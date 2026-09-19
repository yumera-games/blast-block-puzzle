/**
 * プレイ設定（工程 W-2）。**進行データとは別のキーへ持つ。**
 * 進行の `version` を設定のためだけに上げないため（progress.ts とは独立）。
 */

const KEY = 'blast-block:settings';
const VERSION = 1;

export interface Settings {
  /** 効果音を鳴らすか。**初回は ON。** */
  readonly sound: boolean;
}

export const DEFAULT_SETTINGS: Settings = { sound: true };

/** 読む。壊れていても既定値を返し、例外を投げない。 */
export function loadSettings(storage?: Pick<Storage, 'getItem' | 'setItem'>): Settings {
  const store = storage ?? safeStorage();
  if (!store) return DEFAULT_SETTINGS;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return DEFAULT_SETTINGS;
    const o = data as Record<string, unknown>;
    if (o.version !== VERSION) return DEFAULT_SETTINGS;
    return { sound: typeof o.sound === 'boolean' ? o.sound : DEFAULT_SETTINGS.sound };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** 書く。失敗しても黙って諦める。 */
export function saveSettings(s: Settings, storage?: Pick<Storage, 'getItem' | 'setItem'>): void {
  const store = storage ?? safeStorage();
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify({ version: VERSION, sound: s.sound }));
  } catch {
    /* 進行は止めない */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
