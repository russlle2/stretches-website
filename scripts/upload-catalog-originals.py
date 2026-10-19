#!/usr/bin/env python3
"""Upload private originals with resumable TUS, then verify every remote SHA-256.

Reads a private archive inventory and local environment file. Credentials, upload
URLs, and local paths are never printed or written into the public asset library.
Requires requests. Existing objects are immutable; no storage upsert is used.
"""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import threading
import time
from urllib.parse import quote, urljoin, urlparse

import requests

CHUNK_SIZE = 6 * 1024 * 1024
MIME = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.tif': 'image/tiff', '.tiff': 'image/tiff',
        '.psd': 'image/vnd.adobe.photoshop', '.webp': 'image/webp'}


def load_environment(path):
    result = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.removeprefix('export ').split('=', 1)
        result[key.strip()] = value.strip().strip('\"\'')
    return result


def write_json(path, data, private=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', dir=path.parent, encoding='utf-8', delete=False) as stream:
        json.dump(data, stream, indent=2, ensure_ascii=False)
        stream.write('\n')
        temporary = Path(stream.name)
    if private:
        temporary.chmod(0o600)
    temporary.replace(path)


def now():
    return datetime.now(timezone.utc).isoformat()


class UploadError(Exception):
    pass


class CatalogUploader:
    def __init__(self, args):
        self.args = args
        environment = load_environment(args.env_file)
        self.api = environment['SUPABASE_URL'].rstrip('/')
        self.key = environment['SUPABASE_SERVICE_ROLE_KEY']
        if self.key.count('.') == 2:
            try:
                claims = json.loads(base64.urlsafe_b64decode(self.key.split('.')[1] + '==='))
            except (ValueError, TypeError):
                raise UploadError('SUPABASE_SERVICE_ROLE_KEY is not a valid server credential')
            if claims.get('role') != 'service_role':
                raise UploadError('SUPABASE_SERVICE_ROLE_KEY contains an anon/non-service JWT; a private server credential is required')
        hostname = urlparse(self.api).hostname
        if hostname != 'psxmvaushwsboogfnyqi.supabase.co':
            raise UploadError('Refusing an unverified Supabase destination')
        self.storage = self.api.replace('.supabase.co', '.storage.supabase.co')
        self.endpoint = self.storage + '/storage/v1/upload/resumable'
        self.headers = {'Authorization': 'Bearer ' + self.key, 'apikey': self.key}
        self.library_path = args.repo / 'gmf-site/content/asset-library.json'
        self.library = json.loads(self.library_path.read_text())
        self.inventory = json.loads((args.archive / 'inventory.json').read_text())
        if not self.inventory.get('complete'):
            raise UploadError('Local original backup is incomplete')
        self.originals = {row['sha256']: row for row in self.inventory['files']}
        self.state_path = args.archive / 'upload-state.json'
        self.state = json.loads(self.state_path.read_text()) if self.state_path.exists() else {'version': 1, 'assets': {}}
        self.lock = threading.Lock()
        self.remote = {}

    def fail(self, response, operation):
        try:
            payload = response.json()
            detail = payload.get('message') or payload.get('error') or payload.get('msg') or ''
            if isinstance(detail, dict):
                detail = detail.get('message', '')
        except (ValueError, AttributeError):
            detail = response.text[:180]
        detail = str(detail).replace(self.key, '[redacted]')[:300]
        raise UploadError(f'{operation}: HTTP {response.status_code}; {detail}')

    def preflight(self):
        response = requests.get(self.api + '/storage/v1/bucket/gmf-originals', headers=self.headers, timeout=30)
        if response.status_code != 200:
            self.fail(response, 'Private bucket preflight')
        bucket = response.json()
        if bucket.get('public') is not False:
            raise UploadError('Original bucket must be private')
        response = requests.get(self.api + '/rest/v1/gmf_assets', headers=self.headers,
                                params={'select': 'id,sha256,size_bytes,status,storage_path,verified_at', 'limit': '1000'}, timeout=30)
        if response.status_code != 200:
            self.fail(response, 'Asset table preflight')
        self.remote = {row['sha256']: row for row in response.json()}
        print('Verified private bucket and asset table. Remote ready rows: '
              + str(sum(row['status'] == 'ready' for row in self.remote.values())), flush=True)

    def checkpoint(self, asset_id, **values):
        with self.lock:
            self.state['assets'].setdefault(asset_id, {}).update(values)
            write_json(self.state_path, self.state, private=True)

    def object_url(self, storage_path):
        return self.storage + '/storage/v1/object/authenticated/gmf-originals/' + quote(storage_path, safe='/')

    def verify_object(self, session, asset, storage_path):
        response = session.get(self.object_url(storage_path), headers=self.headers, stream=True, timeout=(30, 120))
        if response.status_code != 200:
            self.fail(response, 'Remote original verification')
        checksum = hashlib.sha256()
        size = 0
        with response:
            for block in response.iter_content(1024 * 1024):
                checksum.update(block)
                size += len(block)
        if size != asset['bytes'] or checksum.hexdigest() != asset['sha256']:
            raise UploadError('Remote original checksum/size mismatch: ' + asset['id'])
        return now()

    def upload(self, asset):
        session = requests.Session()
        original = self.originals[asset['sha256']]
        path = Path(original['backupPath'])
        if path.stat().st_size != asset['bytes']:
            raise UploadError('Local archive size changed: ' + asset['id'])
        filename = re.sub(r'[^A-Za-z0-9._-]+', '_', asset['filename']).strip('._')[:180] or 'original'
        storage_path = 'originals/' + asset['sha256'] + '/' + filename
        content_type = MIME.get(path.suffix.lower(), 'application/octet-stream')
        remote = self.remote.get(asset['sha256'])
        if remote and (remote['id'] != asset['id'] or remote['storage_path'] != storage_path):
            raise UploadError('Existing checksum record has a different canonical identity: ' + asset['id'])
        saved = self.state['assets'].get(asset['id'], {})
        if remote and remote['status'] == 'ready' and saved.get('verifiedAt') and remote['size_bytes'] == asset['bytes']:
            self.mark_public(asset, content_type, storage_path, saved['verifiedAt'])
            return asset['bytes'], True
        upload_url = saved.get('uploadUrl')
        offset = 0
        if upload_url:
            response = session.head(upload_url, headers={**self.headers, 'Tus-Resumable': '1.0.0'}, timeout=30)
            if response.status_code == 200:
                offset = int(response.headers.get('Upload-Offset', 0))
            elif response.status_code in {404, 410}:
                upload_url = None
            else:
                self.fail(response, 'Resume upload')
        if not upload_url and not (remote and remote['status'] == 'ready'):
            metadata = {'bucketName': 'gmf-originals', 'objectName': storage_path,
                        'contentType': content_type, 'cacheControl': '3600',
                        'metadata': json.dumps({'sha256': asset['sha256'], 'originalFilename': asset['filename']})}
            encoded = ','.join(key + ' ' + base64.b64encode(value.encode()).decode() for key, value in metadata.items())
            response = session.post(self.endpoint, headers={**self.headers,
                                    'Tus-Resumable': '1.0.0', 'Upload-Length': str(asset['bytes']),
                                    'Upload-Metadata': encoded}, data=b'', timeout=30)
            if response.status_code != 201:
                # A prior process may have completed the object but stopped before
                # registering it. Reuse only after the full checksum check below.
                if response.status_code in {400, 409}:
                    probe = session.get(self.object_url(storage_path), headers={**self.headers, 'Range': 'bytes=0-0'}, stream=True, timeout=30)
                    exists = probe.status_code in {200, 206}
                    probe.close()
                    if not exists:
                        self.fail(response, 'Create resumable upload')
                else:
                    self.fail(response, 'Create resumable upload')
            else:
                upload_url = urljoin(self.endpoint + '/', response.headers['Location'])
                if urlparse(upload_url).scheme != 'https' or urlparse(upload_url).hostname not in {urlparse(self.api).hostname, urlparse(self.storage).hostname}:
                    raise UploadError('Unexpected resumable upload origin')
                offset = int(response.headers.get('Upload-Offset', 0))
                self.checkpoint(asset['id'], uploadUrl=upload_url, storagePath=storage_path, offset=offset)
        if upload_url:
            with path.open('rb') as stream:
                while offset < asset['bytes']:
                    stream.seek(offset)
                    chunk = stream.read(CHUNK_SIZE)
                    for attempt in range(3):
                        try:
                            response = session.patch(upload_url, headers={**self.headers,
                                                     'Tus-Resumable': '1.0.0', 'Upload-Offset': str(offset),
                                                     'Content-Type': 'application/offset+octet-stream'},
                                                     data=chunk, timeout=(30, 120))
                            if response.status_code == 204:
                                next_offset = int(response.headers['Upload-Offset'])
                                if next_offset != offset + len(chunk):
                                    raise UploadError('Invalid upload offset')
                                offset = next_offset
                                self.checkpoint(asset['id'], offset=offset)
                                break
                            if response.status_code < 500 and response.status_code not in {409, 429}:
                                self.fail(response, 'Upload chunk')
                        except requests.RequestException:
                            if attempt == 2:
                                raise UploadError('Network interruption; upload checkpoint preserved')
                        if attempt == 2:
                            self.fail(response, 'Upload chunk after retries')
                        time.sleep(2 * (attempt + 1))
                        head = session.head(upload_url, headers={**self.headers, 'Tus-Resumable': '1.0.0'}, timeout=30)
                        if head.status_code != 200:
                            self.fail(head, 'Resume after interruption')
                        remote_offset = int(head.headers['Upload-Offset'])
                        if remote_offset == offset + len(chunk):
                            offset = remote_offset
                            self.checkpoint(asset['id'], offset=offset)
                            break
                        if remote_offset != offset:
                            raise UploadError('Unexpected resume offset')
        verified_at = self.verify_object(session, asset, storage_path)
        row = {'id': asset['id'], 'sha256': asset['sha256'], 'filename': asset['filename'],
               'content_type': content_type, 'size_bytes': asset['bytes'], 'bucket': 'gmf-originals',
               'storage_path': storage_path, 'status': 'ready', 'created_by': self.args.created_by,
               'product_id': asset.get('suggestedProductId'), 'verified_at': verified_at,
               'upload_history': [{'source': 'USB catalog import', 'verified_at': verified_at,
                                   'filenames': [asset['relativePath'], *asset.get('aliases', [])]}]}
        response = session.post(self.api + '/rest/v1/gmf_assets', headers={**self.headers,
                                'Prefer': 'resolution=merge-duplicates,return=representation'},
                                params={'on_conflict': 'sha256'}, json=row, timeout=30)
        if response.status_code not in {200, 201}:
            self.fail(response, 'Register verified asset')
        returned = response.json()
        if not returned or returned[0].get('sha256') != asset['sha256'] or returned[0].get('status') != 'ready':
            raise UploadError('Asset registration verification failed')
        self.checkpoint(asset['id'], verifiedAt=verified_at, status='ready', error=None)
        self.mark_public(asset, content_type, storage_path, verified_at)
        session.close()
        return asset['bytes'], False

    def mark_public(self, asset, content_type, storage_path, verified_at):
        with self.lock:
            asset.update(originalUrl='/api/source-upload?id=' + quote(asset['id']) + '&download=1',
                         originalStatus='uploaded', contentType=content_type,
                         storagePath=storage_path, uploadedAt=verified_at)
            write_json(self.library_path, self.library)

    def run(self):
        self.preflight()
        assets = self.library['assets']
        if self.args.test_large:
            assets = [min((a for a in assets if a['bytes'] > 50 * 1024 * 1024), key=lambda a: a['bytes'])]
            print('Testing >50 MiB original: ' + assets[0]['filename'] + ' (' + str(assets[0]['bytes']) + ' bytes)', flush=True)
        done = completed_bytes = 0
        failures = []
        with ThreadPoolExecutor(max_workers=self.args.concurrency) as pool:
            work = {pool.submit(self.upload, asset): asset for asset in assets}
            for future in as_completed(work):
                asset = work[future]
                try:
                    size, skipped = future.result()
                    done += 1
                    completed_bytes += size
                    if done % 5 == 0 or self.args.test_large or done == len(assets):
                        print(f'{done}/{len(assets)} private originals ready and verified; {completed_bytes:,} bytes', flush=True)
                except Exception as error:
                    message = str(error).replace(self.key, '[redacted]')[:500]
                    self.checkpoint(asset['id'], error=message, status='failed')
                    failures.append({'id': asset['id'], 'filename': asset['filename'], 'error': message})
                    print('Upload failed: ' + asset['filename'] + ' — ' + message, flush=True)
                    # A quota, authorization, or configuration error should not be
                    # repeated across the whole archive. Keep checkpoints to resume.
                    for pending in work:
                        pending.cancel()
                    break
        # Include a second in-flight worker that may finish after another failed.
        ready = [a for a in assets if a.get('originalStatus') == 'uploaded'
                 and self.state['assets'].get(a['id'], {}).get('verifiedAt')]
        summary = {'requestedAssets': len(assets), 'verifiedAssets': len(ready),
                   'verifiedBytes': sum(a['bytes'] for a in ready), 'failures': failures}
        write_json(self.args.archive / 'upload-report.json', summary, private=True)
        print(json.dumps(summary), flush=True)
        return 1 if failures else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--env-file', type=Path, default=Path(__file__).resolve().parents[1] / '.env.netlify')
    parser.add_argument('--created-by', default='gmfproductions904@gmail.com')
    parser.add_argument('--concurrency', type=int, choices=(1, 2, 3), default=2)
    parser.add_argument('--test-large', action='store_true')
    args = parser.parse_args()
    try:
        return CatalogUploader(args).run()
    except UploadError as error:
        print(str(error), flush=True)
        return 1
    except requests.RequestException:
        print('Network request failed; any completed upload checkpoints remain preserved.', flush=True)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
