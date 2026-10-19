# Catalog source import

`scripts/import-usb-catalog.py` archives every non-system source file before creating web previews. Pass `--source`, `--archive` (outside this repository), and optionally `--repo`. It requires Python and Pillow; `tifffile`, `imagecodecs`, and NumPy support Photoshop CMYK-plus-alpha TIFFs. The source drive is read only. JSX, ZXP, and swatch files are preserved without being executed.

The private archive holds originals and `inventory.json`: source/backup paths, byte sizes, and SHA-256 checksums. Existing originals are never replaced with different bytes; a differing revision goes into a checksum-named directory. Do not commit this archive or its inventory.

`gmf-site/content/asset-library.json` contains portable asset metadata, deduplicated by exact checksum with duplicate filenames retained in `aliases`. Preview files in `assets/catalog-library` preserve transparency and are at most 1200 pixels. A GIF preview shows its first frame; PSD previews use the merged composite. Full-resolution files remain in the private archive until uploaded. `originalUrl: null` and `originalStatus: archived-locally` explicitly mean there is no hosted original yet.

Run `scripts/migrate-catalog-v2.py` after importing. It preserves existing v2 product records, adds reviewed design families as drafts, and links source assets. Printed currency, label sizes, rating symbols, and filenames are not interpreted as prices, garment measurements, stock, or verified certifications. Draft artwork previews are separate from approved garment images.

For private hosting, `scripts/upload-catalog-originals.py --archive <private-archive> --test-large` first tests an original larger than 50 MiB. It reads `.env.netlify` without printing credentials and requires a real service-role/secret key, not an anon key. After the test succeeds, omit `--test-large` to upload with two workers. Uploads use 6 MiB resumable TUS chunks, immutable checksum paths, and private checkpoints. Each original is downloaded and SHA-256 verified before its database row becomes ready. The public library points to the authenticated download endpoint rather than a public storage URL or expiring signed link. Pinned Python dependencies are listed in `scripts/requirements-catalog.txt`.

Mapping decisions:

- Existing Astronaut Status, Paid in Full, and GMF Angel items retain their $30 price and SKU families. Their existing source images are used because the previously generated JPEG paths were not checked into the repository.
- GMF OG ($25) and Game Over ($30) retain their corresponding homepage photographs. GMF Demon has its own draft record and does not reuse the Angel image.
- The four Pre-Fall 2026 drafts retain user-supplied garment specifications and exact SKU prefixes. Prices are unset, availability is false, and source artwork is not marked as an approved garment preview. WHTMONO means white artwork on a black tee.
- Zero Wins numbered files are two designs split into print tiles. Its `Front` filename conflicts with the design named `Back_01` through `Back_04`; garment-side assignment remains unconfirmed.
- Reference images, unrelated Elite Marine assets, print tests, components, and unclear exports stay in the asset library instead of becoming individual products. Family groupings are editable drafts, not a claim of stock or manufacturing readiness.
