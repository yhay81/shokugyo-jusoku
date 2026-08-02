# 職種充足率

厚生労働省「職業安定業務統計 雇用関係指標」の全国計を使い、73職種の充足率と元件数を比較する日本語Webサービスです。

- 公開URL: <https://shokugyo-jusoku.yhay81.com>
- 2023〜2025年度
- パートを含む常用 / パートを除く常用 / 常用的パート
- 最大4職種の比較
- アカウント、Cookie、広告、外部解析なし

## 開発

Node.js 24 と npm 11 を使います。

```powershell
npm ci
npm run release:check
npm run check
npm test
npm run build
```

ローカル起動は `npm run dev`、公開は `npm run deploy` です。D1作成後に `wrangler.jsonc` の `database_id` を設定し、`npx wrangler d1 migrations apply shokugyo-jusoku --remote` を実行します。

## データ再生成

厚生労働省の第6表、第8表を取得後、次を実行します。

```powershell
python scripts/extract-source.py 114-1d-06.xlsx 114-1d-08.xlsx public/data
npm run data:check
```

詳しい境界と照合内容は [SOURCE.md](SOURCE.md) を参照してください。

## License

コードは MIT License。出典データの利用は厚生労働省の利用条件に従います。
