import hashlib
import html
import json
import os
import re
import time


class Spider:
    def __init__(self):
        from localvideo_python_host import current
        self._host = current()
        self._session = None

    def _cache_file(self, key):
        from localvideo_python_host import current
        state = getattr(self, '_host', None) or current()
        root = os.path.join(state['cache'], state['id'])
        os.makedirs(root, exist_ok=True)
        return os.path.join(root, hashlib.sha256(str(key).encode()).hexdigest() + '.json')

    def getCache(self, key):
        try:
            with open(self._cache_file(key), encoding='utf-8') as stream:
                data = json.load(stream)
            return data['value'] if not data['expires'] or data['expires'] > time.time() else None
        except (OSError, ValueError, KeyError):
            return None

    def setCache(self, key, value, expire=0):
        filename = self._cache_file(key)
        data = json.dumps({'value': value, 'expires': time.time() + expire if expire else 0}, ensure_ascii=False)
        if len(data) > 1024 * 1024:
            raise ValueError('Python 缓存数据超过 1 MB')
        with open(filename + '.tmp', 'w', encoding='utf-8') as stream:
            stream.write(data)
        os.replace(filename + '.tmp', filename)
        return 'ok'

    def delCache(self, key):
        try:
            os.remove(self._cache_file(key))
        except FileNotFoundError:
            pass
        return 'ok'

    def getProxyUrl(self, local=False):
        from localvideo_python_host import current
        return (getattr(self, '_host', None) or current())['proxy']

    def _request(self, method, url, **options):
        import requests
        if getattr(self, '_session', None) is None:
            from localvideo_python_host import current
            state = getattr(self, '_host', None) or current()
            self._session = requests.Session()
            self._session.headers.update({'User-Agent': 'okhttp/3.12.13', **state.get('headers', {})})
        options.setdefault('timeout', 15)
        return self._session.request(method, url, **options)

    def fetch(self, url, params=None, cookies=None, headers=None, timeout=15, **options):
        return self._request('GET', url, params=params, cookies=cookies, headers=headers, timeout=timeout, **options)

    def post(self, url, data=None, cookies=None, headers=None, timeout=15, **options):
        return self._request('POST', url, data=data, cookies=cookies, headers=headers, timeout=timeout, **options)

    def regStr(self, reg, text, index=1):
        match = re.search(reg, text)
        return match.group(index) if match else ''

    def removeHtmlTags(self, text):
        return html.unescape(re.sub(r'<[^>]*>', '', str(text)))

    def log(self, text):
        print(text)

    def destroy(self):
        if getattr(self, '_session', None) is not None:
            self._session.close()

    def manualVideoCheck(self):
        return False

    def isVideoFormat(self, url):
        return bool(re.search(r'\.(m3u8|mp4|mkv|flv|ts)(?:[?#]|$)', url, re.I))
