/**
 * titles.json から、静的なHTMLを作る。
 *
 * 作るのは次の4種類。
 *   /                      検索（ブラウザ側で絞り込む）
 *   /title/<kind>-<id>/    作品ごと。どこで見られるかを並べる
 *   /service/<slug>/       配信サービスごとの作品一覧
 *   /service/              配信サービスの一覧
 *
 * **TMDB の規約で、出典表示と JustWatch の帰属が要る。** 各ページの
 * フッターに必ず出す。文言は指定どおりで、こちらで書き換えない。
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const SITE_URL = 'https://dokodemiru.jp'
const SITE_NAME = 'どこで見る？'
const CONTACT = 'info@dokodemiru.jp'
const IMAGE = 'https://image.tmdb.org/t/p/w342'

// TMDB の規約で表示が義務づけられている出典。文言はそのまま出す。
const TMDB_CREDIT =
  'This product uses the TMDB API but is not endorsed or certified by TMDB.'

const KIND_LABEL = { movie: '映画', tv: 'テレビ番組' }
const WHERE_LABEL = {
  flatrate: '定額見放題',
  rent: 'レンタル',
  buy: '購入',
  free: '無料',
}

const publicDir = path.resolve('public')

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** URL に使う形へ。日本語のサービス名もそのまま扱えるようにする。 */
function slugify(name) {
  return String(name || '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'unknown'
}

function titlePath(row) {
  return `/title/${row.kind}-${row.tmdbId}/`
}

function shell({ title, description, canonical, crumbs, body }) {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="ja_JP" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <link rel="stylesheet" href="/assets/page.css" />
  </head>
  <body>
    <div class="wrap">
      <header class="site-head"><a class="site-name" href="/">${escapeHtml(SITE_NAME)}</a></header>
      <nav class="crumbs"><a href="/">${escapeHtml(SITE_NAME)}</a> ＞ ${crumbs}</nav>
      ${body}
      <footer>
        <nav class="site-nav">
          <a href="/">${escapeHtml(SITE_NAME)} トップ</a>
          <a href="/service/">配信サービス一覧</a>
          <a href="/about/">このサイトについて</a>
          <a href="/privacy/">プライバシーポリシー</a>
        </nav>
        <p>掲載内容の訂正・削除のご依頼は <a href="mailto:${CONTACT}">${CONTACT}</a> へご連絡ください。</p>
        <p class="credit">${escapeHtml(TMDB_CREDIT)}</p>
        <p class="credit">配信状況のデータは JustWatch より提供されています。</p>
      </footer>
    </div>
  </body>
</html>
`
}

/** 作品ページ。どこで見られるかを、区分ごとに並べる。 */
function renderTitlePage(row, confirmedOn) {
  const sections = ['flatrate', 'free', 'rent', 'buy']
    .filter((key) => row.where[key]?.length)
    .map((key) => {
      const items = row.where[key]
        .map((service) => `<li><a href="/service/${slugify(service.name)}/">${escapeHtml(service.name)}</a></li>`)
        .join('')
      return `<section><h2>${WHERE_LABEL[key]}</h2><ul class="service-list">${items}</ul></section>`
    })
    .join('')

  const where = ['flatrate', 'free', 'rent', 'buy']
    .filter((key) => row.where[key]?.length)
    .map((key) => WHERE_LABEL[key])
    .join('・')

  const description =
    `${row.title}（${KIND_LABEL[row.kind]}）を日本で見られる配信サービスをまとめています。`
    + `${where}に対応。${confirmedOn} 時点の情報です。`

  const poster = row.poster
    ? `<figure class="poster"><img src="${IMAGE}${escapeHtml(row.poster)}" alt="${escapeHtml(row.title)}" width="342" height="513" loading="lazy" decoding="async" /><figcaption>画像: TMDB</figcaption></figure>`
    : ''

  const facts = [
    row.released ? `<span>公開: ${escapeHtml(row.released)}</span>` : '',
    row.voteCount ? `<span>TMDB評価: ${row.voteAverage}（${row.voteCount.toLocaleString('ja-JP')}件）</span>` : '',
  ].join('')

  return shell({
    title: `${row.title}はどこで見られる？｜${SITE_NAME}`,
    description,
    canonical: `${SITE_URL}${titlePath(row)}`,
    crumbs: escapeHtml(row.title),
    body: `
      <h1>${escapeHtml(row.title)}はどこで見られる？</h1>
      ${row.originalTitle && row.originalTitle !== row.title ? `<p class="original">${escapeHtml(row.originalTitle)}</p>` : ''}
      <div class="facts">${facts}</div>
      <div class="lead-block">
        ${poster}
        ${row.overview ? `<p class="overview">${escapeHtml(row.overview)}</p>` : '<p class="overview thin">あらすじは登録されていません。</p>'}
      </div>
      ${sections}
      ${row.where.link ? `<p class="works"><a class="button" href="${escapeHtml(row.where.link)}" target="_blank" rel="nofollow noopener">JustWatch で詳しく見る</a></p>` : ''}
      <p class="confirmed">
        配信状況は変わります。${escapeHtml(confirmedOn)} 時点で TMDB が公開している情報をそのまま載せています。
        実際に視聴できるか、料金がいくらかは、各サービスでご確認ください。
      </p>`,
  })
}

/** 配信サービスごとの一覧。 */
function renderServicePage(service, rows, confirmedOn) {
  const list = rows
    .slice(0, 300)
    .map((row) => `<li><a href="${titlePath(row)}">${escapeHtml(row.title)}</a><span>${KIND_LABEL[row.kind]}</span></li>`)
    .join('')

  const description =
    `${service.name}で見られる作品${rows.length.toLocaleString('ja-JP')}件をまとめています。`
    + `${confirmedOn} 時点の情報です。`

  return shell({
    title: `${service.name}で見られる作品${rows.length.toLocaleString('ja-JP')}件｜${SITE_NAME}`,
    description,
    canonical: `${SITE_URL}/service/${slugify(service.name)}/`,
    crumbs: `<a href="/service/">配信サービス</a> ＞ ${escapeHtml(service.name)}`,
    body: `
      <h1>${escapeHtml(service.name)}で見られる作品</h1>
      <p class="reading">${escapeHtml(description)}${rows.length > 300 ? '上位300件を表示しています。' : ''}</p>
      <ul class="title-list">${list}</ul>`,
  })
}

/** 配信サービスの一覧。 */
function renderServiceIndex(services, confirmedOn) {
  const list = services
    .map((service) => `<li><a href="/service/${slugify(service.name)}/">${escapeHtml(service.name)}</a><span>${service.titles.toLocaleString('ja-JP')}作品</span></li>`)
    .join('')

  const description = `日本で利用できる配信サービス${services.length}社について、それぞれで見られる作品をまとめています。`

  return shell({
    title: `配信サービス一覧｜${SITE_NAME}`,
    description,
    canonical: `${SITE_URL}/service/`,
    crumbs: '配信サービス',
    body: `
      <h1>配信サービス一覧</h1>
      <p class="reading">${escapeHtml(description)}${escapeHtml(confirmedOn)} 時点のデータです。</p>
      <ul class="service-index">${list}</ul>`,
  })
}

async function main() {
  const file = JSON.parse(await readFile(path.join(publicDir, 'data/titles.json'), 'utf8'))
  const { titles, services, confirmedOn } = file

  await rm(path.join(publicDir, 'title'), { recursive: true, force: true })
  await rm(path.join(publicDir, 'service'), { recursive: true, force: true })

  for (const row of titles) {
    const dir = path.join(publicDir, 'title', `${row.kind}-${row.tmdbId}`)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'index.html'), renderTitlePage(row, confirmedOn), 'utf8')
  }
  console.log(`作品ページ: ${titles.length.toLocaleString('ja-JP')}件`)

  for (const service of services) {
    const rows = titles.filter((row) =>
      ['flatrate', 'rent', 'buy', 'free'].some((key) =>
        row.where[key]?.some((s) => s.name === service.name)))

    const dir = path.join(publicDir, 'service', slugify(service.name))
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'index.html'), renderServicePage(service, rows, confirmedOn), 'utf8')
  }
  await writeFile(path.join(publicDir, 'service/index.html'), renderServiceIndex(services, confirmedOn), 'utf8')
  console.log(`配信サービス: ${services.length}社`)

  // 検索用の索引。作品数が増えても軽いように TSV にする。
  const tsv = titles
    .map((row) => `${row.title}\t${row.originalTitle}\t${row.kind}-${row.tmdbId}\t${row.kind}`)
    .join('\n')
  await writeFile(path.join(publicDir, 'data/search-index.tsv'), `${tsv}\n`, 'utf8')

  const today = new Date().toISOString().slice(0, 10)
  const urls = [
    `${SITE_URL}/`,
    `${SITE_URL}/service/`,
    `${SITE_URL}/about/`,
    `${SITE_URL}/privacy/`,
    ...services.map((s) => `${SITE_URL}/service/${slugify(s.name)}/`),
    ...titles.map((row) => `${SITE_URL}${titlePath(row)}`),
  ]
  await writeFile(
    path.join(publicDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    + urls.map((loc) => `  <url><loc>${loc}</loc><lastmod>${today}</lastmod></url>`).join('\n')
    + `\n</urlset>\n`,
    'utf8'
  )
  console.log(`サイトマップ: ${urls.length.toLocaleString('ja-JP')}件`)
}

await main()
