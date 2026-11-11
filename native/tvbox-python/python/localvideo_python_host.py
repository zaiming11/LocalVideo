"""Native CPython adapter for TVBox Python Spider classes."""
import base64
import contextlib
import contextvars
import inspect
import io
import json
import os
import socket
import ssl
import sys
import time
import types
import urllib.error
import urllib.parse
import urllib.request

_context = contextvars.ContextVar('tvbox_python_site', default={})
_spiders = {}
_configuration = {}
_network_observers_installed = False


def _network_result(url, error=None, status=0):
    state = current()
    if not state or not url:
        return
    try:
        parsed = urllib.parse.urlsplit(str(url))
        if parsed.scheme not in ('http', 'https') or not parsed.hostname:
            return
        # Keep credentials, query strings and paths out of user-facing errors.
        identity = (parsed.scheme, parsed.netloc, parsed.path, parsed.query)
        failures = state['network_failures']
        if error is None and status < 400:
            failures.pop(identity, None)
            return
        reason = getattr(error, 'reason', error)
        code = getattr(error, 'code', status)
        if code and isinstance(code, int) and code >= 400:
            message = 'HTTP ' + str(code)
        elif isinstance(reason, socket.gaierror):
            message = 'DNS 解析失败'
        elif isinstance(reason, (TimeoutError, socket.timeout)):
            message = '请求超时'
        elif isinstance(reason, ssl.SSLError):
            message = 'TLS 连接失败'
        elif isinstance(reason, ConnectionResetError):
            message = '连接被重置'
        elif isinstance(reason, ConnectionRefusedError):
            message = '连接被拒绝'
        else:
            message = '网络连接失败'
        if identity in failures or len(failures) < 8:
            failures[identity] = parsed.hostname + '（' + message + '）'
    except Exception:
        # Diagnostics must not alter the script's HTTP behavior.
        pass


def _install_network_observers():
    global _network_observers_installed
    if _network_observers_installed:
        return
    import requests.sessions
    opener_open = urllib.request.OpenerDirector.open
    session_request = requests.sessions.Session.request

    def observed_open(opener, fullurl, *args, **kwargs):
        url = getattr(fullurl, 'full_url', fullurl)
        try:
            response = opener_open(opener, fullurl, *args, **kwargs)
        except Exception as error:
            _network_result(url, error)
            raise
        _network_result(url, status=response.getcode() or 0)
        return response

    def observed_request(session, method, url, *args, **kwargs):
        try:
            response = session_request(session, method, url, *args, **kwargs)
        except Exception as error:
            _network_result(url, error)
            raise
        _network_result(url, status=response.status_code)
        return response

    urllib.request.OpenerDirector.open = observed_open
    requests.sessions.Session.request = observed_request
    _network_observers_installed = True


def _with_network_warning(value, state):
    if isinstance(value, dict) and not value.get('list') and state['network_failures'] and not value.get('sourceWarning'):
        value = dict(value)
        messages = list(dict.fromkeys(state['network_failures'].values()))[:3]
        value['sourceWarning'] = 'Python 源内容请求失败：' + '；'.join(messages) + '。请检查源地址或切换站点。'
    return value


def current():
    return _context.get()


def _decode(value):
    return json.loads(value) if isinstance(value, str) and value.strip() else value


def _invoke(task):
    if task['action'] == 'configure':
        _configuration.update(task['args'])
        os.environ['SSL_CERT_FILE'] = _configuration['cert']
        os.environ['REQUESTS_CA_BUNDLE'] = _configuration['cert']
        _install_network_observers()
        return {'version': sys.version.split()[0]}
    key = task['id']
    site = task['site']
    state = {'id': key, 'cache': _configuration['cache'], 'headers': site.get('headers', {}), 'proxy': task['proxy'], 'network_failures': {}}
    token = _context.set(state)
    try:
        if key not in _spiders:
            if len(_spiders) >= 4:
                old = next(iter(_spiders))
                instance, name = _spiders.pop(old)
                if hasattr(instance, 'destroy'):
                    instance.destroy()
                sys.modules.pop(name, None)
            name = '_localvideo_spider_' + key
            module = types.ModuleType(name)
            module.__file__ = site['api']
            sys.modules[name] = module
            try:
                exec(compile(task['source'], site['api'], 'exec'), module.__dict__)
                instance = module.Spider()
                instance.init(site.get('ext', ''))
            except BaseException:
                sys.modules.pop(name, None)
                raise
            _spiders[key] = instance, name
        spider = _spiders[key][0]
        action, args = task['action'], task.get('args', {})
        if action == 'home':
            value = _decode(spider.homeContent(True)) or {}
            if not value.get('list') and hasattr(spider, 'homeVideoContent'):
                recommendations = _decode(spider.homeVideoContent()) or {}
                value['list'] = recommendations.get('list', [])
            return _with_network_warning(value, state)
        if action == 'category':
            return _with_network_warning(_decode(spider.categoryContent(str(args.get('id', '')), str(args.get('page', 1)), True, args.get('extend', {}))), state)
        if action == 'search':
            parameters = [str(args.get('keyword', '')), False]
            if len(inspect.signature(spider.searchContent).parameters) >= 3:
                parameters.append(str(args.get('page', 1)))
            return _with_network_warning(_decode(spider.searchContent(*parameters)), state)
        if action == 'detail':
            return _decode(spider.detailContent([str(args.get('id', ''))]))
        if action == 'play':
            return _decode(spider.playerContent(str(args.get('flag', '')), str(args.get('url', '')), args.get('flags', [])))
        if action == 'proxy':
            response = spider.localProxy(args)
            body = response[2]
            binary = isinstance(body, (bytes, bytearray))
            return {'status': int(response[0]), 'mime': str(response[1]), 'body': base64.b64encode(body).decode() if binary else str(body), 'binary': binary, 'headers': response[3] if len(response) > 3 else {}}
        raise ValueError('未知 Python Spider 操作：' + action)
    finally:
        _context.reset(token)


def dispatch(payload):
    deadline = time.monotonic() + 45
    def trace(frame, event, arg):
        if time.monotonic() > deadline:
            raise TimeoutError('Python Spider 执行超时')
        return trace
    previous = sys.gettrace()
    try:
        sys.settrace(trace)
        # Scripts may print diagnostics; keep their output out of the JSON channel.
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            result = _invoke(json.loads(payload))
        return json.dumps({'ok': True, 'body': result}, ensure_ascii=False)
    except BaseException as error:
        message = str(error)
        if isinstance(error, ModuleNotFoundError):
            message = 'Python 脚本缺少依赖 ' + str(error.name) + '；当前未内置此扩展'
        return json.dumps({'ok': False, 'error': type(error).__name__ + ': ' + message}, ensure_ascii=False)
    finally:
        sys.settrace(previous)
