# dokodemiru（dokodemiru.jp）

映画やテレビ番組が、日本のどの配信サービスで見られるかを調べられるサイト。

- 本番URL: https://dokodemiru.jp
- 配信: GitHub Pages（`public/CNAME` に `dokodemiru.jp`）
- **GitHub の Settings → Pages でも Custom domain の設定が要る。**
  CNAME ファイルだけでは足りない

## 掲載データの方針

- **TMDB が公開している項目だけを載せる。** 推測・補間・独自の評価は載せない
- 当サイトによる順位付けやおすすめはしない。並び順は TMDB の評価件数
- 料金や画質は載せない。サービスやプランで変わるため
- 配信の開始予定・終了予定も載せない。確かな情報源が無いため
- **配信状況は頻繁に変わる。** 取得日を各ページに出し、最終確認は各サービスで、と明記する
- 削除依頼の窓口 `info@dokodemiru.jp` を画面に出しておく

## TMDB の規約

**次の表示が義務づけられている。全ページのフッターに出している。**

```
This product uses the TMDB API but is not endorsed or certified by TMDB.
```

配信状況は TMDB が JustWatch から受け取っているデータなので、その帰属も併記する。
**文言はそのまま出す。こちらで書き換えない。**

### 広告は出さない

無料の API キーで許されているのは**非商用の範囲だけ**。利用規約 2.A に
「この license は TMDB / TMDB API / TMDB Content のいかなる商用利用も認めない」とある。
商用で使うには TMDB と別途の書面契約が要り、料金の対象になりうる。

- **このサイトに AdSense などの広告を入れない。** 収益が出た時点で商用と見なされうる
- **順位付け・おすすめもしない。** TMDB は商用の例に
  「TMDB を組み込んで映画やテレビ番組をおすすめするサイトの運営」を挙げている
- 方針を変えて広告を出すなら、**先に TMDB へ問い合わせる**

## データ取得

| 出典 | スクリプト | 認証情報（環境変数） |
|---|---|---|
| The Movie Database (TMDB) | `scripts/fetch-titles.py` | `TMDB_TOKEN` |

`TMDB_TOKEN` は **API Read Access Token**（Bearer で送る長い文字列）。
API キー（32文字のほう）ではない。

**キーはリポジトリに書かない。** GitHub Secrets に入れ、環境変数で渡す。

```
TMDB_TOKEN=xxx python scripts/fetch-titles.py public/data/titles.json
node scripts/build-site.mjs
```

`PAGES` で取得件数を調整できる（1ページ20件、映画とテレビでそれぞれ）。
**1作品ごとに配信先を問い合わせる**ので、増やすと時間がかかる。

## 生成されるページ

| URL | 内容 |
|---|---|
| `/` | 作品名で検索（索引はTSV、入力時に読み込む） |
| `/title/<kind>-<id>/` | 作品ごと。どこで見られるかを区分ごとに並べる |
| `/service/<slug>/` | 配信サービスごとの作品一覧（上位300件） |
| `/service/` | 配信サービスの一覧 |

生成したページは `.gitignore` に入れてある。commit するのは
`public/data/titles.json` だけ。

## 取り直し

`refresh-data.yml` が**毎日05:00 JST**に実行する。配信状況は変わりやすいので、
週1回では古くなる。

### デプロイの落とし穴（対処済み）

`refresh-data.yml` から `deploy.yml` を呼ぶ経路には、3つ落とし穴がある。
**push でのデプロイでは起きず、取り直し経由のときだけ起きる**ので気づきにくい。

1. **古いSHAをチェックアウトする。** 既定ではワークフロー起動時のSHAになるため、
   bot が commit したデータを含まないまま配信される → `ref: main` を明示
2. **`secrets: inherit` が無いと Secret が渡らない。** 再利用ワークフローは
   呼び出し元の Secret を自動では受け取らない
3. **`git pull --rebase` が止まる。** ビルドが commit しないファイルも書き換えるため
   「未コミットの変更がある」と拒まれる → `--autostash` を付ける

## 削除依頼

`info@dokodemiru.jp`。画面にも表示している。
