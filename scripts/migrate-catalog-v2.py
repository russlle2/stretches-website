#!/usr/bin/env python3
"""Seed catalog v2 from confirmed live items and reviewed USB design families.

Existing v2 product records are never overwritten. Run after import-usb-catalog.py
to attach new library assets; imported artwork remains draft and unavailable.
"""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'gmf-site/content/design-manifest.json'
LIBRARY = ROOT / 'gmf-site/content/asset-library.json'
SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL']


def slugify(value):
    return re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-')


def product(slug, name, garment='', collection='design-library', prefix=None):
    return {'id': slug, 'slug': slug, 'skuPrefix': prefix or 'GMF-' + slug.upper(),
            'name': name, 'garment': garment, 'collection': collection,
            'status': 'draft', 'description': '', 'material': '', 'fit': '',
            'gsm': None, 'care': [], 'sizeGuide': {}, 'images': [],
            'sourceAssetIds': [], 'variants': [], 'previews': []}


def variants(prefix, price=None, image='', color='As Shown', color_code='AS-SHOWN',
             artwork='', approved=False, available=False, color_hex=None):
    return [{'sku': prefix + '-' + size, 'size': size, 'colorCode': color_code,
             'color': color, 'colorHex': color_hex, 'artworkColorway': artwork,
             'unitAmount': price, 'currency': 'usd', 'available': available,
             'image': image, 'previewApproved': approved} for size in SIZES]


def live_products():
    confirmed = [
        ('astronaut-status-tee', 'Astronaut Status Tee', 'GMF-TEE-ASTRONAUTSTATUS', 3000,
         '/assets/designs/astronaut-status.png', 'You\'ll only be as big as your goals.'),
        ('paid-in-full-shirt-tee', 'Paid in Full Tee', 'GMF-TEE-PAIDINFULLSHIRT', 3000,
         '/assets/designs/paid-in-full-shirt.png', 'Paid in Full.'),
        ('gmf-angel-tee', 'GMF Angel Tee', 'GMF-TEE-GMFANGEL', 3000,
         '/assets/designs/gmf-angel.png', 'GMF Angel.'),
        ('gmf-og-tee', 'GMF OG Tee', 'GMF-TEE-GMFOG', 2500,
         '/assets/uploads/1788943670263-og-gmf-white-logo.PNG', 'The GMF original.'),
        ('game-over-tee', 'Game Over Tee', 'GMF-TEE-GAMEOVER', 3000,
         '/assets/uploads/1784359734736-B8499466-47D2-4877-82F4-1F143466C018.PNG', 'Game Over.'),
    ]
    products = []
    for slug, name, prefix, price, image, description in confirmed:
        if not (ROOT / 'gmf-site' / image.lstrip('/')).is_file():
            raise FileNotFoundError(image)
        p = product(slug, name, 'tee', 'core', prefix)
        p.update(status='published', description=description, images=[image],
                 sizeGuide={'sizes': SIZES},
                 provenance={'source': 'Existing live catalog and homepage merchandising',
                             'note': 'Existing imagery and USD price retained. No material or fit specification inferred.'})
        p['variants'] = variants(prefix, price, image, approved=True, available=True)
        products.append(p)
    demon = product('gmf-demon-tee', 'GMF Demon Tee', 'tee', 'core', 'GMF-TEE-GMFDEMON')
    demon['description'] = 'GMF Demon design. Select and approve the correct garment imagery before publishing.'
    demon['variants'] = variants(demon['skuPrefix'])
    demon['provenance'] = {'source': 'Legacy manifest', 'note': 'Separated from the duplicated GMF Angel record; no Angel image reused.'}
    products.append(demon)
    return products


def prefall_products():
    descriptions = [
        {
            'slug': 'prefall-2026-hustler-forever-hoodie', 'name': 'Hustler Forever Hoodie',
            'garment': 'hoodie', 'prefix': 'GMF-PF26-HUSTLERHD-PIGBLK', 'colorCode': 'PIGBLK',
            'color': 'Pigment Black', 'artwork': 'Benjamin / Coral #LLRR', 'gsm': 420,
            'material': 'Dry-hand 3-end fleece; ring-spun cotton 21-singles face; 500 GSM rib.',
            'fit': 'Boxy fit with drop shoulder; double hood without drawcord.',
            'description': 'Distressed Gettin Money Forever Benjamin chest artwork, with coral #LLRR barbed wire above the right wrist. Matte DTF print.',
            'construction': ['12.5 oz fleece', 'Double hood', 'No drawcord', '500 GSM rib'],
            'care': ['Hang dry'],
        },
        {
            'slug': 'prefall-2026-live-rich-die-rollin-tee', 'name': 'Live Rich Die Rollin Tee',
            'garment': 'tee', 'prefix': 'GMF-PF26-LRDRTEE-BLK', 'colorCode': 'BLK',
            'color': 'Washed Black', 'artwork': 'Crimson / Acid Yellow', 'gsm': 240,
            'material': 'Organic cotton; garment dyed and washed; sueded finish.',
            'fit': 'Relaxed boxy fit.',
            'description': 'Crimson GMF arch on the front and oversized cracked Live Rich Die Rollin artwork in acid yellow on the back. Matte DTF print.',
            'construction': ['8 oz jersey', 'Double-needle collar'], 'care': ['Hang dry'],
            'claims': ['GOTS organic cotton', 'Oeko-Tex Standard 100'],
        },
        {
            'slug': 'prefall-2026-live-rich-die-rollin-mono-tee', 'name': 'Live Rich Die Rollin Mono Tee',
            'garment': 'tee', 'prefix': 'GMF-PF26-LRDRTEE-WHTMONO', 'colorCode': 'WHTMONO',
            'color': 'Washed Black', 'artwork': 'White Monochrome', 'gsm': 240,
            'material': 'Organic cotton; garment dyed and washed; sueded finish.',
            'fit': 'Relaxed boxy fit.',
            'description': 'White monochrome Live Rich Die Rollin artwork on the washed-black tee. Matte DTF print.',
            'construction': ['8 oz jersey', 'Double-needle collar'], 'care': ['Hang dry'],
            'claims': ['GOTS organic cotton', 'Oeko-Tex Standard 100'],
        },
        {
            'slug': 'prefall-2026-llrr-benjamin-crewneck', 'name': '#LLRR Benjamin Crewneck',
            'garment': 'crewneck', 'prefix': 'GMF-PF26-LLRRCREW-BLK', 'colorCode': 'BLK',
            'color': 'Black', 'artwork': 'Monochrome Benjamin / Red #LLRR / White Back', 'gsm': 450,
            'material': 'Crossgrain 3-end fleece; ring-spun 21-singles face; 520 GSM 1×1 ribs and side panels.',
            'fit': 'Structured fit.',
            'description': 'Monochrome Benjamin chest artwork with distressed red #LLRR barbed wire and white Gettin Money Forever artwork on the upper back.',
            'construction': ['13.5 oz fleece', 'Reverse coverstitch', '520 GSM 1×1 ribs and side panels'],
            'care': ['Hang dry flat'],
        },
    ]
    result = []
    for spec in descriptions:
        p = product(spec['slug'], spec['name'], spec['garment'], 'pre-fall-2026', spec['prefix'])
        for field in ('description', 'material', 'fit', 'gsm', 'care', 'construction'):
            p[field] = spec[field]
        p['sizeGuide'] = {'sizes': SIZES, 'fitNote': spec['fit']}
        p['variants'] = variants(spec['prefix'], color=spec['color'], color_code=spec['colorCode'],
                                 artwork=spec['artwork'])
        p['provenance'] = {'source': 'User-supplied Pre-Fall 2026 specifications',
                           'note': 'Specifications retained as supplied. Price, measurements, stock, garment imagery, and certification evidence require confirmation.'}
        if spec.get('claims'):
            p['certificationClaims'] = [{'name': claim, 'verification': 'not-verified',
                                          'source': 'user-supplied'} for claim in spec['claims']]
        result.append(p)
    return result


# Only reviewed, meaningful design families become products. Components and unclear
# references remain fully searchable in the asset library without inventing SKUs.
DESIGN_FAMILIES = {
    'No Fake Smiles Allowed', 'Fake Smiles Bear', 'Fake Smiles Vintage',
    'No Fake Smiles Cityscape', 'Fake Smiles', 'Law Abiding', 'Two Worlds',
    'Zero Wins', 'Torn Soul', 'Final Play', 'GMF Angel and Devil',
    'Money Laundry', 'Arachnida', 'Backstabbed', 'Motivation', 'LLRR',
    'Hustler Original', 'Hustle 25', 'Joint Custody', 'Crisis Duval',
    '3039 Archives', 'Roman Numeral Logo', 'Dirty Hands Clean Money',
    'Experimental Typography', 'Stand Out', 'Future Style', 'Smile Over the Pain',
    'No Fade', 'Broken Heart', 'Dreamer', 'Lost Love', 'Loyalty Over Royalty',
    'Hope Skull', 'St Muerte', 'July 82', 'February 36', 'Comic Retro Vintage',
    'Dont Look Back', 'Skull 3039', 'Sorry Not Sorry', 'Beacon of Hope',
    'Two Side Streetwear',
}


def main():
    manifest = json.loads(MANIFEST.read_text())
    existing = manifest.get('products', []) if manifest.get('schemaVersion') == 2 else []
    products = list(existing)
    by_id = {p['id']: p for p in products}
    for p in live_products() + prefall_products():
        if p['id'] not in by_id:
            products.append(p)
            by_id[p['id']] = p
    library = json.loads(LIBRARY.read_text()) if LIBRARY.exists() else {'version': 1, 'assets': []}
    grouped = {}
    for asset in library['assets']:
        grouped.setdefault(asset['family'], []).append(asset)
    for family, assets in sorted(grouped.items()):
        if family not in DESIGN_FAMILIES:
            continue
        complete = [a for a in assets if a['kind'] == 'artwork' and a.get('previewUrl')]
        if not complete and family == '3039 Archives':
            complete = [a for a in assets if a['kind'] == 'source' and a.get('previewUrl')]
        if not complete:
            continue
        identity = 'design-' + slugify(family)
        if identity not in by_id:
            p = product(identity, family)
            p['description'] = family + ' design artwork. Garment, price, sizing, and approved product photography have not been configured.'
            p['provenance'] = {'source': 'Imported USB design library', 'note': 'Artwork is not a garment photograph. Family grouping is editorial and remains draft.'}
            if family == 'Zero Wins':
                p['provenance']['note'] += ' Front/back filenames conflict; confirm placement. Numbered files are print tiles, not variants.'
            products.append(p)
            by_id[identity] = p
        p = by_id[identity]
        for asset in assets:
            if asset['id'] not in p['sourceAssetIds']:
                p['sourceAssetIds'].append(asset['id'])
            asset.setdefault('suggestedProductId', identity)
        # Design previews are deliberately separate from approved garment images.
        if not p.get('previews'):
            p['previews'] = [{'assetId': a['id'], 'url': a['previewUrl'], 'type': 'artwork',
                              'label': a['filename'], 'approved': False} for a in complete[:8]]
    # This one candidate matches the user's description; retain it as a candidate.
    hustler = by_id['prefall-2026-hustler-forever-hoodie']
    for a in library['assets']:
        if a['filename'] == 'Hustler Original - Hustler Original.png':
            if a['id'] not in hustler['sourceAssetIds']:
                hustler['sourceAssetIds'].append(a['id'])
            if not hustler['previews'] and a.get('previewUrl'):
                hustler['previews'] = [{'assetId': a['id'], 'url': a['previewUrl'], 'type': 'artwork',
                                        'label': 'Chest artwork candidate — garment preview not approved', 'approved': False}]
    MANIFEST.write_text(json.dumps({'schemaVersion': 2, 'currency': 'USD', 'products': products},
                                   indent=2, ensure_ascii=False) + '\n')
    if LIBRARY.exists():
        LIBRARY.write_text(json.dumps(library, indent=2, ensure_ascii=False) + '\n')
    print(f'Catalog v2: {len(products)} products; {sum(p["status"] == "published" for p in products)} published.')


if __name__ == '__main__':
    main()
