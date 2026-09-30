# Individual menu photographs

All 56 catalog products now use separate lossless WebP files in
`public/images/dishes/`. They are extracted at the source resolution, with the
same elliptical/rounded mask previously drawn by `DishPicture`. No generated
food or upscaling is used. Original menu pages remain unchanged.

`server/data/dish-images.json` records the source URL, exact original crop,
category, output path and SHA-256. To reproduce from a saved `/api/menu` data
snapshot (the object containing `dishes`):

```sh
npx tsx scripts/extract-dish-images.ts artifacts/menu-before-extraction.json
npm run build
```

Deploy the new `dist/public/images/dishes` directory along with the application.
For an existing catalog, after backing up the database and loading the service
environment, run from the release directory:

```sh
npx tsx scripts/migrate-dish-images.ts
```

The script verifies deployed file hashes, locks the relevant records in a
transaction, and updates only matching old photographs. Staff uploads, adjusted
crops and changed categories are skipped. All other product data is preserved.
Changes are audited as `DISH_IMAGE_EXTRACTED`. Re-running is safe. Fresh seeds
use the extracted images immediately; the catalog import version is unchanged.

Photo-menu permalink: `/menu/photos`. Direct navigation opens the gallery;
closing a direct visit returns to `/menu`. Opening from the banner adds a
history entry, so Back/Forward works. Both the banner area and gallery contain
a copy-link button, with a selectable URL fallback if clipboard access fails.
