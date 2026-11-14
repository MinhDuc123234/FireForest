# Earth Fire Intelligence

Exported from [this design](https://www.magicpatterns.com/os/jA8Dej3Cd16zVUVoZMeHwv?file=4Ui2GMuWuywXe2dn3mPNkw) on [Magic Patterns](https://magicpatterns.com).

## Getting started

1. `npm install`
2. `npm run dev`

## Local app in FireForest

From the repository root, run the dashboard with:

```bash
cd web
npm install
npm run dev
```

The burning calendar reads `public/data/monthly_series.csv`, and the Vietnam map reads `public/data/grid10km_monthly_harmonized.csv`. Both are copied from the repository's `out/` directory. After regenerating harmonized outputs, copy both CSVs into `web/public/data/` to refresh the app.
