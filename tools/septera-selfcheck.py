#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SEPTERA 人物ラフ 自己検査ツール（Python 標準ライブラリのみ / 外部コマンド不要）

使い方:  python3 septera-selfcheck.py <PNGファイル> --zip <ZIPファイル>

PNG 検査・ZIP 検査とも標準ライブラリだけで完結します。
unzip などの外部コマンドは使用しません。ZIP はファイルシステムへ展開しません。

条件 B の背景の固定安全帯は 左 x0〜99 / 右 x924〜1023 です。
人物が入れる範囲は x100〜x923、最大 824px となり、条件 D の 640〜780px と両立します。
「人物外接の外に非背景 0 画素」は、全非背景画素から外接を求める実装では
定義上必ず 0 になるため、情報表示のみとし、B の合否には含めません。

条件 A・B・C・E は登録済みの人物ラフに共通の条件です。
条件 D（幅）・F（荷の大きさ）・H（平均彩度）は**渡りのオーレン v1 専用の合否条件**で、
ほかの登録済み人物に対しては FAIL になります。それが正しい挙動です。

条件 G（肩紐の角度）と I（顔）は自動測定できません。理由は実行時に表示します。
"""
import sys, os, zlib, struct, hashlib, statistics, zipfile

BG = (128, 128, 128)          # #808080
W_EXP, H_EXP = 1024, 2048

# ---------- PNG 読み込み（8bit RGBA・非インターレースのみ） ----------
def read_png(path):
    raw = open(path, 'rb').read()
    info = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
    if raw[:8] != b'\x89PNG\r\n\x1a\n':
        raise SystemExit('PNG シグネチャが不正です')
    info['width'], info['height'] = struct.unpack('>II', raw[16:24])
    info['depth'], info['ctype'] = raw[24], raw[25]
    info['interlace'] = raw[28]
    off, idat, bad, chunks = 8, 0, [], []
    data = bytearray()
    while off < len(raw):
        ln = struct.unpack('>I', raw[off:off+4])[0]
        typ = raw[off+4:off+8].decode('ascii', 'replace')
        body = raw[off+8:off+8+ln]
        got = struct.unpack('>I', raw[off+8+ln:off+12+ln])[0]
        if got != (zlib.crc32(raw[off+4:off+8+ln]) & 0xFFFFFFFF):
            bad.append(typ)
        chunks.append(typ)
        if typ == 'IDAT':
            idat += 1
            data += body
        off += 12 + ln
        if typ == 'IEND':
            break
    info['idat'] = idat
    info['crc_bad'] = bad
    info['trailing'] = len(raw) - off
    info['chunks'] = chunks
    if (info['depth'], info['ctype'], info['interlace']) != (8, 6, 0):
        raise SystemExit('8bit RGBA / 非インターレース以外は判定できません')

    w, h = info['width'], info['height']
    un = zlib.decompress(bytes(data))
    stride, bpp = w * 4, 4
    px = bytearray(h * stride)
    prev = bytearray(stride)
    pos = 0
    for y in range(h):
        f = un[pos]; pos += 1
        line = bytearray(un[pos:pos+stride]); pos += stride
        if f == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i-bpp]) & 255
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i-bpp] if i >= bpp else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i-bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i-bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        elif f != 0:
            raise SystemExit('未知のフィルタ %d' % f)
        px[y*stride:(y+1)*stride] = line
        prev = line
    return info, px, w, h

# ---------- 補助 ----------
def make_helpers(px, w):
    def rgb(x, y):
        i = (y*w + x) * 4
        return px[i], px[i+1], px[i+2]
    def is_bg(x, y):
        i = (y*w + x) * 4
        return px[i] == 128 and px[i+1] == 128 and px[i+2] == 128
    def val(x, y):
        i = (y*w + x) * 4
        return (px[i] + px[i+1] + px[i+2]) / 3.0
    return rgb, is_bg, val

def row_extent(is_bg, w, y):
    a = b = -1
    for x in range(w):
        if not is_bg(x, y):
            a = x; break
    if a < 0:
        return None
    for x in range(w-1, -1, -1):
        if not is_bg(x, y):
            b = x; break
    return a, b

# ---------- ZIP 検査（zipfile のみ・展開しない） ----------
def zip_check(zip_path, png_path):
    """戻り値: (status, lines)  status は 'PASS' / 'FAIL' / '未確認'"""
    L = []
    if not zip_path:
        L.append('   ZIP が指定されていません（--zip <ZIPファイル>）')
        L.append('   → ZIP 検査は未確認です。PASS 扱いにはしません。')
        return '未確認', L

    zb = open(zip_path, 'rb').read()
    L.append('   ZIPのファイル名     : %s' % os.path.basename(zip_path))
    L.append('   ZIPのバイト数       : %d' % len(zb))
    L.append('   ZIP全体のSHA-256    : %s' % hashlib.sha256(zb).hexdigest())

    ok = True
    def bad(msg):
        nonlocal ok
        ok = False
        L.append('   × %s' % msg)

    try:
        zf = zipfile.ZipFile(zip_path)
    except zipfile.BadZipFile as e:
        L.append('   エントリ数          : 読み取り不能')
        bad('ZIP として読み取れません: %s' % e)
        return 'FAIL', L

    with zf:
        infos = zf.infolist()
        L.append('   エントリ数          : %d' % len(infos))
        if len(infos) != 1:
            bad('エントリ数が 1 件ではありません（条件 1）')
            for it in infos:
                L.append('     - %s' % it.filename)
            return 'FAIL', L

        info = infos[0]
        isdir = info.is_dir()
        ext = os.path.splitext(info.filename)[1]
        enc = bool(info.flag_bits & 0x1)
        L.append('   内部エントリ名      : %s' % info.filename)
        L.append('   ディレクトリか      : %s' % ('はい' if isdir else 'いいえ'))
        L.append('   拡張子              : %s' % (ext if ext else '（なし）'))
        L.append('   暗号化              : %s' % ('あり' if enc else 'なし'))

        if isdir:
            bad('唯一のエントリがディレクトリです（条件 2）')
        if ext.lower() != '.png':
            bad('唯一のエントリの拡張子が .png ではありません（条件 2）')
        if enc:
            bad('エントリが暗号化されています（条件 5）')
        if not ok:
            L.append('   CRC検査             : 未実施（上記のため）')
            return 'FAIL', L

        try:
            crc_bad = zf.testzip()
        except RuntimeError as e:
            L.append('   CRC検査             : 実施不能（%s）' % e)
            bad('CRC 検査を実施できません（条件 4）')
            return 'FAIL', L
        L.append('   CRC検査             : %s'
                 % ('正常' if crc_bad is None else '不一致 %s' % crc_bad))
        if crc_bad is not None:
            bad('ZIP 内 CRC が不一致です（条件 4）')
            return 'FAIL', L

        try:
            inner = zf.read(info.filename)
        except Exception as e:
            bad('内部 PNG を読み取れません: %s' % e)
            return 'FAIL', L

    outer = open(png_path, 'rb').read()
    ih, oh = hashlib.sha256(inner).hexdigest(), hashlib.sha256(outer).hexdigest()
    L.append('   内部PNGのバイト数   : %d' % len(inner))
    L.append('   内部PNGのSHA-256    : %s' % ih)
    L.append('   指定PNGのバイト数   : %d' % len(outer))
    L.append('   指定PNGのSHA-256    : %s' % oh)
    L.append('   SHA-256 の一致      : %s' % ('一致' if ih == oh else '不一致'))
    L.append('   バイト列の完全一致  : %s' % ('一致' if inner == outer else '不一致'))
    if ih != oh:
        bad('内部 PNG と指定 PNG の SHA-256 が一致しません（条件 3）')
    if inner != outer:
        bad('内部 PNG と指定 PNG のバイト列が一致しません（条件 3）')

    return ('PASS' if ok else 'FAIL'), L


# ---------- 本体 ----------
def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    png = sys.argv[1]
    zipf = None
    if '--zip' in sys.argv:
        zipf = sys.argv[sys.argv.index('--zip') + 1]

    info, px, w, h = read_png(png)
    rgb, is_bg, val = make_helpers(px, w)
    res = {}
    P = lambda k, ok, txt: (res.__setitem__(k, ok),
                            print('  [%s] %s  %s' % ('PASS' if ok else 'FAIL', k, txt)))

    print('=' * 64)
    print('1. ZIP（zipfile のみ・展開しません）')
    zstatus, zlines = zip_check(zipf, png)
    for ln in zlines:
        print(ln)
    print('   ZIP検査             : %s' % zstatus)

    print('\n2. 内部PNG')
    print('   ファイル名      : %s' % os.path.basename(png))
    print('   バイト数        : %d' % info['bytes'])
    print('   SHA-256         : %s' % info['sha256'])

    print('\n3. PNG形式')
    print('   寸法            : %d×%d' % (info['width'], info['height']))
    print('   ビット深度      : %d' % info['depth'])
    print('   カラータイプ    : %d' % info['ctype'])
    print('   インターレース  : %d（0＝非インターレース）' % info['interlace'])
    a255 = sum(1 for i in range(3, len(px), 4) if px[i] == 255)
    aoth = (w*h) - a255
    print('   α=255 の画素数  : %d' % a255)
    print('   α≠255 の画素数  : %d' % aoth)
    print('   IDAT の実測個数 : %d' % info['idat'])
    print('   CRC             : %s' % ('全チャンク正常' if not info['crc_bad']
                                       else '不一致 ' + ','.join(info['crc_bad'])))
    print('   IEND後の余剰    : %d バイト' % info['trailing'])
    print('   チャンク構成    : %s' % ','.join(info['chunks']))
    okA = (info['width'] == W_EXP and info['height'] == H_EXP and info['depth'] == 8
           and info['ctype'] == 6 and info['interlace'] == 0 and aoth == 0
           and not info['crc_bad'] and info['trailing'] == 0)
    print('\n【判定】')
    P('A 形式', okA, '1024×2048 / 8bit / type6 / 非インターレース / α全255 / CRC正常 / 余剰0')

    print('\n4. 背景')
    corners = 0
    for x0, y0 in ((0, 0), (w-40, 0), (0, h-40), (w-40, h-40)):
        for y in range(y0, y0+40):
            for x in range(x0, x0+40):
                if is_bg(x, y):
                    corners += 1
    left = sum(1 for y in range(h) for x in range(0, 100) if not is_bg(x, y))
    right = sum(1 for y in range(h) for x in range(924, 1024) if not is_bg(x, y))
    print('   四隅6,400の一致 : %d' % corners)
    print('   左端 x0〜99     : 非背景 %d 画素' % left)
    print('   右端 x924〜1023 : 非背景 %d 画素' % right)

    X0, X1, Y0, Y1, area = w, -1, h, -1, 0
    for y in range(h):
        for x in range(w):
            if is_bg(x, y):
                continue
            area += 1
            if x < X0: X0 = x
            if x > X1: X1 = x
            if y < Y0: Y0 = y
            if y > Y1: Y1 = y
    outside = 0
    for y in range(h):
        if Y0 <= y <= Y1:
            for x in range(w):
                if not (X0 <= x <= X1) and not is_bg(x, y):
                    outside += 1
        else:
            for x in range(w):
                if not is_bg(x, y):
                    outside += 1
    print('   人物外接外      : 非背景 %d 画素（外接定義による情報表示）' % outside)
    P('B 背景', corners == 6400 and left == 0 and right == 0,
      '四隅6400 / 左端 x0〜99 が 0 / 右端 x924〜1023 が 0')

    print('\n5. 人物形状')
    bw, bh = X1-X0+1, Y1-Y0+1
    widths = []
    for y in range(Y0, Y1+1):
        e = row_extent(is_bg, w, y)
        widths.append(0 if e is None else e[1]-e[0]+1)
    mx = max(widths); mrow = Y0 + widths.index(mx)
    print('   人物外接        : x%d〜%d / y%d〜%d' % (X0, X1, Y0, Y1))
    print('   幅              : %d' % bw)
    print('   高さ            : %d' % bh)
    print('   面積            : %d' % area)
    print('   最大幅          : %d' % mx)
    print('   最大幅の行位置  : y=%d（上端から %d px ＝ %.2f%%）'
          % (mrow, mrow-Y0, (mrow-Y0)/bh*100))
    P('C 高さ', 1434 <= bh <= 1474, '1,434〜1,474 に対し %d' % bh)
    P('D 幅',  640 <= bw <= 780,   '640〜780 に対し %d（登録済み最大 トゥーラ 603）' % bw)

    print('\n6. 条件F（荷の大きさ）')
    def band(lo, hi):
        y0 = Y0 + round(bh*lo); y1 = Y0 + round(bh*hi)
        vals = [widths[y-Y0] for y in range(y0, y1+1) if widths[y-Y0] > 0]
        return y0, y1, statistics.median(vals)
    a0, a1, W1 = band(0.15, 0.35)
    b0, b1, W2 = band(0.75, 0.95)
    ratio = W1 / W2 if W2 else 0
    print('   上側の帯 15〜35%% : y%d〜%d   W1 = %.1f' % (a0, a1, W1))
    print('   下側の帯 75〜95%% : y%d〜%d   W2 = %.1f' % (b0, b1, W2))
    print('   W1 / W2         : %.4f' % ratio)
    P('F-1 荷の絶対幅', W1 >= 620, 'W1 が 620 以上に対し %.1f（登録済み最大 トゥーラ 564）' % W1)
    P('F-2 上が広い',   ratio >= 1.60, 'W1/W2 が 1.60 以上に対し %.4f' % ratio)
    P('F-3 脚の太さ',   W2 >= 260, 'W2 が 260 以上に対し %.1f（細い脚で比を稼がないため）' % W2)

    print('\n8. 条件H（平均彩度）')
    s, n = 0.0, 0
    for y in range(Y0, Y1+1):
        for x in range(X0, X1+1):
            if is_bg(x, y):
                continue
            r, g, b = rgb(x, y)
            mxc, mnc = max(r, g, b), min(r, g, b)
            if mxc:
                s += (mxc-mnc)/mxc
            n += 1
    sat = s/n if n else 0
    print('   平均彩度        : %.6f' % sat)
    P('H 平均彩度', 0.18 <= sat <= 0.30, '0.18〜0.30 に対し %.6f' % sat)

    print('\n9. 条件E（肌の継ぎ目・8連結）')
    mark = bytearray(w*h)
    def skin(x, y):
        i = (y*w+x)*4
        return (not is_bg(x, y)) and (px[i]-px[i+2] >= 18) and val(x, y) >= 55
    for y in range(2, h-2):
        for x in range(2, w-2):
            if skin(x, y) and skin(x-1, y) and abs(val(x, y)-val(x-1, y)) >= 12:
                mark[y*w+x] = 1
    lab = bytearray(w*h)
    chains = []
    for k in range(w*h):
        if not mark[k] or lab[k]:
            continue
        st = [k]; lab[k] = 1
        mnx = mxx = k % w; mny = mxy = k // w
        while st:
            p = st.pop()
            pxx, pyy = p % w, p // w
            if pxx < mnx: mnx = pxx
            if pxx > mxx: mxx = pxx
            if pyy < mny: mny = pyy
            if pyy > mxy: mxy = pyy
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    nx, ny = pxx+dx, pyy+dy
                    if 0 <= nx < w and 0 <= ny < h:
                        q = ny*w+nx
                        if mark[q] and not lab[q]:
                            lab[q] = 1; st.append(q)
        chains.append(mxy-mny+1)
    longs = [c for c in chains if c >= 40]
    longest = max(chains) if chains else 0
    print('   継ぎ目の本数    : %d（縦40px以上の鎖）' % len(longs))
    print('   最長の縦の広がり: %d' % longest)
    P('E 肌の継ぎ目', len(longs) <= 14 and longest <= 110,
      '14本以下・最長110以下 に対し %d本 / %d' % (len(longs), longest))

    print('\n7. 条件G（肩紐の角度）／ 10. 顔')
    print('   ★ この 2 項目は自動測定できません。')
    print('     G：肩紐だけを画像から切り出す確実な方法がありません。色で抜くと')
    print('        肌・髪・衣が混ざります（カイエの鞄帯で 4 通り試して全て失敗）。')
    print('        制作側が、角度測定に使った線分の両端点の座標とともに申告して')
    print('        ください。検証側はその端点で角度を再計算します。')
    print('     I：目・虹彩・瞳孔・まつ毛・眉・髭の不在は人が見て確認します。')
    print('        採用した方式 (a)(b)(c) を申告してください。')

    print('\n11. 最終判定')
    print('   %s : %s' % ('ZIP 検査'.ljust(14), zstatus))
    for k in ('A 形式', 'B 背景', 'C 高さ', 'D 幅', 'E 肌の継ぎ目',
              'F-1 荷の絶対幅', 'F-2 上が広い', 'F-3 脚の太さ', 'H 平均彩度'):
        print('   %s : %s' % (k.ljust(14), 'PASS' if res.get(k) else 'FAIL'))
    print('   %s : 申告が必要（自動測定不可）' % 'G 肩紐'.ljust(14))
    print('   %s : 申告が必要（自動測定不可）' % 'I 顔'.ljust(14))
    print()
    if zstatus == 'PASS' and all(res.values()):
        print('   → 提出可。G（肩紐の角度と測定に使った両端点の座標）と')
        print('     I（採用した顔の方式 (a)(b)(c) と禁止要素が無いことの確認）を')
        print('     申告に必ず含めてください。')
    else:
        if zstatus != 'PASS':
            print('   → ZIP 検査が %s のため、提出不可です。' % zstatus)
        if not all(res.values()):
            print('   → FAIL の項目があるため、提出不可です。')
        print('     提出せず、数値をそのまま報告してください。')
    print('=' * 64)

main()
