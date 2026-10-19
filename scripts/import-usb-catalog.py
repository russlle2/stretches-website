#!/usr/bin/env python3
"""Archive a catalog USB without modifying it; publish small, alpha-safe previews.

Requires Pillow. Originals and the detailed checksum inventory stay outside Git.
The import is resumable, deduplicates library entries by SHA-256, and never replaces
an existing original with different bytes. No design scripts/packages are run.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError

IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.tif', '.tiff', '.psd', '.webp'}
TOOL_EXTENSIONS = {'.jsx', '.zxp', '.aco'}
SKIP_DIRECTORIES = {'System Volume Information', '__MACOSX'}
Image.MAX_IMAGE_PIXELS = None  # Known large print masters; process one at a time.


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def write_json(path, value, private=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False) as stream:
        json.dump(value, stream, indent=2, ensure_ascii=False)
        stream.write('\n')
        temp = Path(stream.name)
    if private:
        temp.chmod(0o600)
    temp.replace(path)


def source_files(source):
    return sorted((p for p in source.rglob('*') if p.is_file()
                   and not p.is_symlink()
                   and not any(part.startswith('.') or part in SKIP_DIRECTORIES
                               for part in p.relative_to(source).parts)),
                  key=lambda p: p.relative_to(source).as_posix().casefold())


def archive(source, relative, archive_root, known=None):
    """Stream into private storage, hash and verify; differing names become revisions."""
    target = archive_root / 'originals' / relative
    if known and target.exists() and source.stat().st_size == known.get('bytes'):
        if source.stat().st_mtime_ns == known.get('sourceMtimeNs'):
            if sha256(target) == known.get('sha256'):
                return target, known['sha256']
    target.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    with tempfile.NamedTemporaryFile('wb', dir=archive_root, prefix='.incoming-', delete=False) as out:
        temporary = Path(out.name)
        try:
            with source.open('rb') as stream:
                for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
                    digest.update(block)
                    out.write(block)
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    checksum = digest.hexdigest()
    try:
        if sha256(temporary) != checksum:
            raise OSError('Backup verification failed: ' + relative)
        if target.exists():
            if sha256(target) == checksum:
                return target, checksum
            target = archive_root / 'revisions' / checksum / relative
            target.parent.mkdir(parents=True, exist_ok=True)
        try:
            os.link(temporary, target)  # Atomic exclusive creation: cannot overwrite.
        except FileExistsError:
            if sha256(target) != checksum:
                raise OSError('Refusing to overwrite differing backup: ' + str(target))
        target.chmod(0o600)
        return target, checksum
    finally:
        temporary.unlink(missing_ok=True)


def family_for(relative):
    text = relative.casefold()
    checks = [
        ('Apparel Size Tags', r'apparel size tags'),
        ('Production tools and tests', r'\.jsx$|\.zxp$|\.aco$|cmyk_test|white_test|^dtf\.'),
        ('Elite Marine Construction', r'elite marine'),
        ('No Fake Smiles Allowed', r'no fake smiles allowed tech pack|fake smiles 2'),
        ('Fake Smiles Bear', r'fake.?smiles.*(?:bear|flaw)'),
        ('Fake Smiles Vintage', r'fake.?smiles.?vintage'),
        ('Fake Smiles Shark', r'fake.?smiles.*shark'),
        ('No Fake Smiles Cityscape', r'no fake smiles cityscape'),
        ('Law Abiding', r'lawabiding'), ('Two Worlds', r'twoworlds'),
        ('Fake Smiles', r'fake.?smiles'),
        ('Zero Wins', r'zero.?wins|harmless'),
        ('Torn Soul', r'tornsoul'), ('Final Play', r'final play'),
        ('GMF Angel and Devil', r'devilangel|angel.?devil|royal blue devil|^angel\.'),
        ('Money Laundry', r'money laundry'),
        ('Arachnida', r'arachnida'), ('Backstabbed', r'backstabbed'),
        ('Motivation', r'motivation graphic'),
        ('LLRR', r'llrr'), ('Hustler Original', r'hustler original'),
        ('Hustle 25', r'hustle25'), ('Joint Custody', r'jointcustody'),
        ('Crisis Duval', r'crisisduval'), ('3039 Archives', r'3039 archives'),
        ('Roman Numeral Logo', r'roman.?numeral.?logo'),
        ('Dirty Hands Clean Money', r'dirty hands clean money|^(dirty|hands|clean|money)\.'),
        ('Experimental Typography', r'experimental typography|^look\.'),
        ('Stand Out', r'nmbd'), ('Future Style', r'future style'),
        ('Smile Over the Pain', r'smile over the pain'), ('No Fade', r'no fade'),
        ('Broken Heart', r'broken heart'), ('Dreamer', r'dreamer'),
        ('Lost Love', r'lost.?love'), ('Loyalty Over Royalty', r'loyaltyoverroyalty'),
        ('Hope Skull', r'hope skull'), ('St Muerte', r'st muerte'),
        ('July 82', r'jul 82'), ('February 36', r'feb36'),
        ('Comic Retro Vintage', r'comic retro vintage'),
        ('Dont Look Back', r'don.t look back'), ('Skull 3039', r'skull 3039'),
        ('Sorry Not Sorry', r'sorry not sorry'), ('Beacon of Hope', r'beacon of hope'),
        ('Two Side Streetwear', r'two side streetwear'),
        ('Print separations', r'actionseps|gang-sheet'),
        ('Reference images', r'google search|^images(?: \(\d+\))?\.|grunge-design-vector|seamless-|^img_|gold marylin|illustrationimage'),
    ]
    for name, pattern in checks:
        if re.search(pattern, text):
            return name
    return 'Unsorted artwork'


def kind_for(relative, family):
    text = relative.casefold()
    ext = Path(relative).suffix.lower()
    if ext in TOOL_EXTENSIONS:
        return 'production-tool'
    if ext in {'.psd', '.tif', '.tiff'}:
        return 'source'
    if family in {'Reference images', 'Elite Marine Construction', 'Production tools and tests'}:
        return 'reference'
    if (family in {'Apparel Size Tags', 'Print separations'}
            or text.startswith('images/')
            or re.search(r'(?:_0[1-4]|fronttop|frontbttm|backtop|backbttm|frtop|frbttm|bcktop|bckbttm|bottom|\(top\)|\(bttm\)|wire|artboard|richtext|smiley|peace sign| - star| - lip)\b', text)):
        return 'component'
    return 'artwork'


def open_cmyk_alpha_tiff(original):
    """Decode Photoshop's CMYK+alpha TIFF variant using optional TIFF codecs."""
    try:
        import numpy as np
        import tifffile
    except ImportError:
        return None
    with tifffile.TiffFile(original) as document:
        page = document.pages[0]
        if int(page.photometric) != 5 or page.samplesperpixel != 5:
            return None
        pixels = page.asarray()
        if pixels.dtype != np.uint8 or pixels.ndim != 3 or pixels.shape[2] != 5:
            return None
        alpha = pixels[:, :, 4].copy()
        color = pixels[:, :, :4].copy()
        if page.extrasamples and int(page.extrasamples[0]) == 1:
            # Associated alpha stores premultiplied CMYK samples. Unassociate
            # before converting the embedded print color profile to sRGB.
            divisor = np.maximum(alpha.astype(np.float32), 1)[:, :, None]
            color = np.clip(color.astype(np.float32) * 255 / divisor, 0, 255).astype(np.uint8)
            color[alpha == 0] = 0
        cmyk = Image.fromarray(color, 'CMYK')
        profile = page.tags.get(34675)
        if profile:
            rgb = ImageCms.profileToProfile(cmyk, ImageCms.ImageCmsProfile(io.BytesIO(profile.value)),
                                            ImageCms.createProfile('sRGB'), outputMode='RGB')
        else:
            rgb = cmyk.convert('RGB')
        rgb.putalpha(Image.fromarray(alpha))
        rgb.format = 'TIFF'
        rgb.info['previewMethod'] = 'cmyk-alpha-tiff'
        return rgb


def make_preview(original, output, maximum):
    """Decode only images, strip metadata, preserve alpha, and cap preview weight."""
    try:
        opened = Image.open(original)
    except UnidentifiedImageError:
        opened = open_cmyk_alpha_tiff(original) if original.suffix.lower() in {'.tif', '.tiff'} else None
        if opened is not None:
            return save_preview(opened, output, maximum)
        # Some Photoshop CMYK TIFF variants are supported by macOS ImageIO but
        # not Pillow. Convert into a temporary thumbnail; never alter the master.
        sips = shutil.which('sips')
        if original.suffix.lower() not in {'.tif', '.tiff'} or not sips:
            raise
        metadata = subprocess.run([sips, '-g', 'pixelWidth', '-g', 'pixelHeight', str(original)],
                                  check=True, capture_output=True, text=True).stdout
        width = int(re.search(r'pixelWidth:\s*(\d+)', metadata).group(1))
        height = int(re.search(r'pixelHeight:\s*(\d+)', metadata).group(1))
        with tempfile.TemporaryDirectory(prefix='gmf-tiff-preview-') as temporary:
            converted = Path(temporary) / 'preview.png'
            subprocess.run([sips, '-s', 'format', 'png', '-Z', str(maximum),
                            str(original), '--out', str(converted)],
                           check=True, capture_output=True)
            info = make_preview(converted, output, maximum)
            info.update(width=width, height=height, format='TIFF',
                        previewMethod='system-tiff-conversion')
            return info
    return save_preview(opened, output, maximum)


def save_preview(opened, output, maximum):
    with opened as image:
        info = {'width': image.width, 'height': image.height,
                'format': image.format,
                'frameCount': getattr(image, 'n_frames', 1) if image.format == 'GIF' else 1}
        if image.info.get('previewMethod'):
            info['previewMethod'] = image.info['previewMethod']
        # PSD opens on its merged composite; seeking frame zero can fail or select
        # a layer. GIF already opens on frame zero. Preserve that default view.
        image.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
        image = ImageOps.exif_transpose(image)
        image = image.convert('RGBA' if image.mode in {'RGBA', 'LA', 'P'} else 'RGB')
        output.parent.mkdir(parents=True, exist_ok=True)
        image.save(output, 'WEBP', quality=78, method=4)
        if output.stat().st_size > 150_000:
            image.thumbnail((900, 900), Image.Resampling.LANCZOS)
            image.save(output, 'WEBP', quality=68, method=4)
        if output.stat().st_size > 220_000:
            image.thumbnail((600, 600), Image.Resampling.LANCZOS)
            image.save(output, 'WEBP', quality=65, method=4)
        info.update(previewWidth=image.width, previewHeight=image.height,
                    previewBytes=output.stat().st_size)
        return info


def compact_previews(assets, preview_dir):
    """Bring older imported previews within the current small-library budget."""
    for asset in assets:
        if asset.get('previewStatus') != 'ready':
            continue
        output = preview_dir / (asset['id'] + '.webp')
        if not output.exists() or output.stat().st_size <= 150_000:
            continue
        with Image.open(output) as source:
            if max(source.size) <= 600 or (max(source.size) <= 900 and output.stat().st_size <= 220_000):
                asset.update(previewWidth=source.width, previewHeight=source.height,
                             previewBytes=output.stat().st_size)
                continue
            image = source.convert('RGBA' if 'A' in source.getbands() else 'RGB')
            image.thumbnail((900, 900), Image.Resampling.LANCZOS)
            image.save(output, 'WEBP', quality=68, method=4)
            if output.stat().st_size > 220_000:
                image.thumbnail((600, 600), Image.Resampling.LANCZOS)
                image.save(output, 'WEBP', quality=65, method=4)
            asset.update(previewWidth=image.width, previewHeight=image.height,
                         previewBytes=output.stat().st_size)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--archive', required=True, type=Path)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--max-size', type=int, default=1200)
    args = parser.parse_args()
    args.source = args.source.resolve()
    args.archive = args.archive.resolve()
    args.repo = args.repo.resolve()
    if not args.source.is_dir():
        parser.error('Source drive is not mounted')
    if args.archive.is_relative_to(args.source) or args.archive.is_relative_to(args.repo):
        parser.error('Original archive must be outside the source drive and Git repository')
    files = source_files(args.source)
    total_bytes = sum(p.stat().st_size for p in files)
    args.archive.mkdir(parents=True, exist_ok=True)
    args.archive.chmod(0o700)
    if shutil.disk_usage(args.archive).free < total_bytes + 1024 ** 3:
        parser.error('Need space for all originals plus at least 1 GiB working space')
    inventory_path = args.archive / 'inventory.json'
    prior = json.loads(inventory_path.read_text()) if inventory_path.exists() else {}
    known = {row['relativePath']: row for row in prior.get('files', [])}
    library_path = args.repo / 'gmf-site/content/asset-library.json'
    previous = json.loads(library_path.read_text()) if library_path.exists() else {}
    previous_assets = {row['sha256']: row for row in previous.get('assets', [])}
    preview_dir = args.repo / 'gmf-site/assets/catalog-library'
    inventory, assets, seen = [], [], {}
    errors = []
    print(f'Importing {len(files)} files ({total_bytes:,} bytes); originals remain private.', flush=True)
    for index, source in enumerate(files, 1):
        relative = source.relative_to(args.source).as_posix()
        original, checksum = archive(source, relative, args.archive, known.get(relative))
        stat = source.stat()
        inventory.append({'relativePath': relative, 'sourcePath': str(source),
                          'backupPath': str(original), 'bytes': stat.st_size,
                          'sourceMtimeNs': stat.st_mtime_ns, 'sha256': checksum})
        if checksum in seen:
            seen[checksum]['aliases'].append(relative)
        else:
            family = family_for(relative)
            old = previous_assets.get(checksum, {})
            asset_id = 'usb-' + checksum[:20]
            asset = {'id': asset_id, 'filename': source.name, 'relativePath': relative,
                     'family': old.get('family', family), 'kind': old.get('kind', kind_for(relative, family)),
                     'originalUrl': old.get('originalUrl'), 'previewUrl': None,
                     'width': None, 'height': None, 'sha256': checksum,
                     'bytes': stat.st_size, 'aliases': [],
                     'originalStatus': 'uploaded' if old.get('originalUrl') or old.get('originalStatus') == 'uploaded' else 'archived-locally',
                     'previewStatus': 'not-applicable',
                     'usage': 'Design asset; not a garment photograph or approved product preview.'}
            # Keep later admin annotations and private-storage metadata on repeat
            # imports while refreshing fields derived from the original bytes.
            for key, value in old.items():
                if key not in asset:
                    asset[key] = value
            if source.suffix.lower() in IMAGE_EXTENSIONS:
                destination = preview_dir / (asset_id + '.webp')
                try:
                    if destination.exists() and old.get('previewStatus') == 'ready':
                        image_info = {k: old[k] for k in ('width', 'height', 'format', 'frameCount', 'previewWidth', 'previewHeight', 'previewBytes') if k in old}
                    else:
                        image_info = make_preview(original, destination, min(args.max_size, 1200))
                    asset.update(image_info)
                    asset.update(previewUrl='/assets/catalog-library/' + destination.name,
                                 previewStatus='ready')
                except Exception as error:
                    asset['previewStatus'] = 'unavailable'
                    asset['previewError'] = type(error).__name__
                    errors.append({'relativePath': relative, 'error': str(error)})
            seen[checksum] = asset
            assets.append(asset)
        # Checkpoint every original, including preview failures, for safe interruption.
        write_json(inventory_path, {'version': 1, 'sourceRoot': str(args.source),
                   'archiveRoot': str(args.archive), 'expectedFiles': len(files),
                   'expectedBytes': total_bytes, 'complete': index == len(files),
                   'files': inventory, 'previewErrors': errors}, private=True)
        if index % 10 == 0 or index == len(files):
            print(f'{index}/{len(files)} originals verified; {len(assets)} unique assets; '
                  f'{sum(a["previewStatus"] == "ready" for a in assets)} previews', flush=True)
            write_json(library_path, {'version': 1, 'assets': assets})
    compact_previews(assets, preview_dir)
    summary = {'files': len(files), 'uniqueAssets': len(assets),
               'originalBytes': total_bytes,
               'duplicateAliases': sum(len(a['aliases']) for a in assets),
               'previewCount': sum(a['previewStatus'] == 'ready' for a in assets),
               'previewBytes': sum(a.get('previewBytes', 0) for a in assets),
               'previewErrors': len(errors)}
    write_json(library_path, {'version': 1, 'summary': summary, 'assets': assets})
    print(json.dumps(summary), flush=True)


if __name__ == '__main__':
    main()
