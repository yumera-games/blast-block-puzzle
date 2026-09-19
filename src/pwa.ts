/**
 * ホーム画面からの起動まわり（工程 W-7）。
 *
 * **ゲームのコードから切り離してある。** Service Worker の登録に失敗しても、
 * 対応していない環境でも、**通常のオンラインのゲームはそのまま動く**ことだけを守る。
 * 保存データ（`localStorage` の 4 キー）には一切触らない。
 */

/** 登録の結果。呼び出し側は待つ必要が無く、記録と試験のためだけに返す。 */
export type SwResult = 'registered' | 'unsupported' | 'failed' | 'skipped';

interface SwLike {
  register(url: string, opts?: { scope?: string }): Promise<unknown>;
}

/**
 * Service Worker を登録する。**投げない。**
 *
 * `url` と `scope` はどちらも**相対**にしてある。ページの場所から解決されるので、
 * ローカル開発（`/`）でも GitHub Pages のサブパス（`/blast-block-puzzle/`）でも、
 * 同じ 1 行で正しい場所を指す。scope は必ず置き場所の直下になり、**その外へは出ない。**
 */
export async function registerServiceWorker(opts: {
  sw?: SwLike | undefined;
  /** 本番ビルドのときだけ登録する。開発サーバでは登録しない（更新の取り違えを避ける）。 */
  enabled: boolean;
  /** `import.meta.env.BASE_URL`。既定は './'。 */
  base?: string;
}): Promise<SwResult> {
  if (!opts.enabled) return 'skipped';
  const sw = opts.sw;
  if (!sw || typeof sw.register !== 'function') return 'unsupported';
  const base = opts.base ?? './';
  try {
    await sw.register(`${base}sw.js`, { scope: base });
    return 'registered';
  } catch {
    // 登録できなくてもゲームは続く。**ここで例外を外へ出さない。**
    return 'failed';
  }
}
