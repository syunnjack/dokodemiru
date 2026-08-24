"""TMDB から、日本で配信されている作品と配信先を集める。

出典: The Movie Database (TMDB)
      https://www.themoviedb.org/

このサイトが載せるのは「その作品を、日本のどの配信サービスで見られるか」だけ。
あらすじや評価は TMDB のものをそのまま載せ、こちらで書き換えない。
配信状況は TMDB が JustWatch から受け取っているデータで、**変わりやすい**。
取得日を必ず画面に出し、最終的な確認は各サービスでしてもらう。

**TMDB の規約により、次を必ず守る。**
  - 出典表示「This product uses the TMDB API but is not endorsed or certified by TMDB.」
  - TMDB のロゴを併記する
  - 配信状況を表示するページには JustWatch の帰属を出す

認証は環境変数から読む。リポジトリには置かない。
  TMDB_TOKEN（API Read Access Token。Bearer で送る）

使い方:
  TMDB_TOKEN=xxx python scripts/fetch-titles.py public/data/titles.json
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

API = 'https://api.themoviedb.org/3'
REGION = 'JP'
LANG = 'ja-JP'
INTERVAL = 0.3

# 集める範囲。人気順の上位から取る。増やすと時間がかかるので、
# まずは映画・テレビそれぞれ10ページ（各200件）から始める。
PAGES = int(os.environ.get('PAGES') or 10)


def fetch(path: str, params: dict, token: str) -> dict:
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f'{API}/{path}?{query}',
        headers={'Authorization': f'Bearer {token}', 'accept': 'application/json'},
    )

    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.loads(response.read().decode())
        except urllib.error.HTTPError as error:
            if error.code == 429:      # 叩きすぎ。待って掛け直す。
                time.sleep(10 * (attempt + 1))
                continue
            if attempt == 4:
                print(f'    あきらめます: {path} {error}', file=sys.stderr)
                return {}
            time.sleep(3 * (attempt + 1))
        except Exception as error:
            if attempt == 4:
                print(f'    あきらめます: {path} {error}', file=sys.stderr)
                return {}
            time.sleep(3 * (attempt + 1))

    return {}


def providers(kind: str, tmdb_id: int, token: str) -> dict:
    """日本で見られる配信サービス。TMDB が返したものだけを持つ。"""
    payload = fetch(f'{kind}/{tmdb_id}/watch/providers', {}, token)
    japan = (payload.get('results') or {}).get(REGION) or {}

    def names(key: str) -> list:
        return [
            {
                'name': row.get('provider_name', ''),
                'id': row.get('provider_id'),
                'logo': row.get('logo_path', ''),
            }
            for row in (japan.get(key) or [])
            if row.get('provider_name')
        ]

    return {
        # flatrate=定額見放題 / rent=レンタル / buy=購入 / free=無料
        'flatrate': names('flatrate'),
        'rent': names('rent'),
        'buy': names('buy'),
        'free': names('free'),
        'link': japan.get('link', ''),   # JustWatch の該当ページ
    }


def collect(kind: str, token: str) -> list:
    """人気順に作品を集め、日本の配信先が1つでもあるものだけ残す。"""
    rows = []
    seen = set()

    for page in range(1, PAGES + 1):
        payload = fetch(f'discover/{kind}', {
            'language': LANG,
            'watch_region': REGION,
            'sort_by': 'popularity.desc',
            'page': page,
            # 日本で何らかの形で配信されているものに絞る
            'with_watch_monetization_types': 'flatrate|rent|buy|free',
        }, token)

        items = payload.get('results') or []
        if not items:
            break

        for item in items:
            tmdb_id = item.get('id')
            if not tmdb_id or tmdb_id in seen:
                continue
            seen.add(tmdb_id)

            where = providers(kind, tmdb_id, token)
            if not any(where[k] for k in ('flatrate', 'rent', 'buy', 'free')):
                continue

            title = (item.get('title') or item.get('name') or '').strip()
            if not title:
                continue

            rows.append({
                'kind': kind,                       # movie / tv
                'tmdbId': tmdb_id,
                'title': title,
                'originalTitle': (item.get('original_title') or item.get('original_name') or '').strip(),
                'overview': (item.get('overview') or '').strip(),
                'released': (item.get('release_date') or item.get('first_air_date') or '')[:10],
                'poster': item.get('poster_path') or '',
                'voteAverage': item.get('vote_average'),
                'voteCount': item.get('vote_count'),
                'where': where,
            })

            time.sleep(INTERVAL)

        print(f'  {kind}: {len(rows):,}件（{page}ページ目まで）', flush=True)
        time.sleep(INTERVAL)

    return rows


def main() -> None:
    output = Path(sys.argv[1])
    token = os.environ.get('TMDB_TOKEN')

    if not token:
        raise SystemExit('環境変数 TMDB_TOKEN が必要です。')

    rows = collect('movie', token) + collect('tv', token)
    rows.sort(key=lambda r: -(r.get('voteCount') or 0))

    # 配信サービスの一覧も持っておく（絞り込みに使う）。
    services = {}
    for row in rows:
        for key in ('flatrate', 'rent', 'buy', 'free'):
            for service in row['where'][key]:
                services.setdefault(service['name'], {
                    'name': service['name'],
                    'id': service['id'],
                    'logo': service['logo'],
                    'titles': 0,
                })
                services[service['name']]['titles'] += 1

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({
        'confirmedOn': date.today().isoformat(),
        'sourceLabel': 'The Movie Database (TMDB)',
        'sourceUrl': 'https://www.themoviedb.org/',
        'region': REGION,
        'titles': rows,
        'services': sorted(services.values(), key=lambda s: -s['titles']),
    }, ensure_ascii=False), encoding='utf-8')

    print()
    print(f'{len(rows):,}作品を書き出しました → {output}')
    print(f'  配信サービス: {len(services)}社')
    for service in sorted(services.values(), key=lambda s: -s['titles'])[:10]:
        print(f"    {service['name']}: {service['titles']:,}作品")


main()
