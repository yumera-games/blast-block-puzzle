import { describe, expect, it } from 'vitest';
import { registerServiceWorker } from '../src/pwa';

/**
 * Service Worker の登録（工程 W-7）。
 * 見るのは**「失敗してもゲームを止めない」**ことと、
 * **登録先と scope がページの場所の内側にとどまる**ことだけ。
 */
describe('pwa: Service Worker の登録', () => {
  it('本番ビルドでは、置き場所の直下を相対で登録する', async () => {
    const calls: { url: string; scope?: string }[] = [];
    const r = await registerServiceWorker({
      sw: { register: (url, opts) => (calls.push({ url, scope: opts?.scope }), Promise.resolve({})) },
      enabled: true,
      base: './',
    });
    expect(r).toBe('registered');
    expect(calls).toEqual([{ url: './sw.js', scope: './' }]);
  });

  it('**相対なので、公開サブパスでもローカルでも内側へ解決する**', async () => {
    const calls: { url: string; scope?: string }[] = [];
    await registerServiceWorker({
      sw: { register: (url, opts) => (calls.push({ url, scope: opts?.scope }), Promise.resolve({})) },
      enabled: true,
      base: './',
    });
    const { url, scope } = calls[0]!;
    for (const page of [
      'https://yumera-games.github.io/blast-block-puzzle/',
      'http://localhost:5173/',
      'http://localhost:5184/blast-block-puzzle/',
    ]) {
      expect(new URL(url, page).href).toBe(`${page}sw.js`);
      expect(new URL(scope!, page).href).toBe(page);
    }
  });

  it('開発サーバでは登録しない', async () => {
    let called = false;
    const r = await registerServiceWorker({
      sw: { register: () => ((called = true), Promise.resolve({})) },
      enabled: false,
    });
    expect(r).toBe('skipped');
    expect(called).toBe(false);
  });

  it('対応していない環境でも投げない', async () => {
    expect(await registerServiceWorker({ sw: undefined, enabled: true })).toBe('unsupported');
    expect(await registerServiceWorker({ sw: {} as never, enabled: true })).toBe('unsupported');
  });

  it('**登録に失敗しても投げない**（ゲームはそのまま続く）', async () => {
    const r = await registerServiceWorker({
      sw: { register: () => Promise.reject(new Error('SecurityError')) },
      enabled: true,
    });
    expect(r).toBe('failed');
  });

  it('register が同期で投げても投げ返さない', async () => {
    const r = await registerServiceWorker({
      sw: {
        register: () => {
          throw new Error('blocked');
        },
      },
      enabled: true,
    });
    expect(r).toBe('failed');
  });
});
