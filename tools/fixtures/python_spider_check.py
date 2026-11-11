import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

root = sys.argv[1]
sys.path.insert(0, os.path.join(root, 'static', 'tvbox-python', 'requirements.zip'))
sys.path.insert(0, os.path.join(root, 'native', 'tvbox-python', 'python'))
import localvideo_python_host as host


class Handler(BaseHTTPRequestHandler):
    retry_calls = 0

    def do_GET(self):
        route = self.path.split('?')[0]
        status = 404 if route == '/private-missing' else 503 if route == '/unavailable' else 200
        if route == '/retry':
            Handler.retry_calls += 1
            status = 503 if Handler.retry_calls == 1 else 200
        body = json.dumps({'agent': self.headers.get('User-Agent'), 'cookie': self.headers.get('Cookie')}).encode()
        self.send_response(status)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Set-Cookie', 'fixture=1; Path=/')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


server = HTTPServer(('127.0.0.1', 0), Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
source = '''
from base.spider import Spider as Base
class Spider(Base):
 def __init__(self):
  self.name = 'subclass without super'
 def init(self, extend=''):
  self.extend=extend
 def homeContent(self, filter):
  visits=(self.getCache('visits') or 0)+1
  self.setCache('visits', visits)
  return {'class':[{'type_id':'1','type_name':'分类'}], 'visits':visits}
 def homeVideoContent(self):
  first=self.fetch(self.extend+'/one').json()
  second=self.fetch(self.extend+'/two').json()
  assert first['agent']=='fixture-agent'
  assert second['cookie']=='fixture=1'
  return {'list':[{'vod_id':'1','vod_name':'真实请求验证'}]}
 def categoryContent(self, tid, pg, filter, extend):
  return {'list':[{'vod_id':tid, 'vod_name':pg}]}
 def searchContent(self, keyword, quick):
  return {'list':[{'vod_id':keyword, 'vod_name':'两参数搜索'}]}
 def detailContent(self, ids):
  return {'list':[{'vod_id':ids[0], 'vod_play_url':'第一集$opaque'}]}
 def playerContent(self, flag, id, flags):
  return {'parse':0, 'url':'https://fixture.test/video.mp4', 'header':{'Referer':flag}}
 def localProxy(self, args):
  return [200, 'application/octet-stream', bytes([0,255,16]), {'X-Test':'1'}]
'''
try:
    with tempfile.TemporaryDirectory(prefix='localvideo-python-unit-') as cache:
        result = json.loads(host.dispatch(json.dumps({'action':'configure','args':{'cache':cache,'cert':os.path.join(root,'static/tvbox-python/cacert.pem')}})))
        assert result['ok']
        def invoke(action, args=None, key='site', script=source):
            task={'action':action,'args':args or {},'id':key,'source':script,'proxy':'http://127.0.0.1:1234/proxy?do=py&py='+key,
                  'site':{'api':'https://fixture.test/spider.py','ext':'http://127.0.0.1:'+str(server.server_port),'headers':{'User-Agent':'fixture-agent'}}}
            return json.loads(host.dispatch(json.dumps(task,ensure_ascii=False)))
        home=invoke('home');assert home['ok'],home
        assert len(home['body']['list'])==1 and home['body']['visits']==1
        assert invoke('home')['body']['visits']==2
        assert invoke('home',key='other')['body']['visits']==1
        assert invoke('category',{'id':'1','page':2})['body']['list'][0]['vod_name']=='2'
        assert invoke('search',{'keyword':'测试😀','page':3})['body']['list'][0]['vod_id']=='测试😀'
        assert invoke('detail',{'id':'opaque'})['body']['list'][0]['vod_play_url']=='第一集$opaque'
        assert invoke('play',{'url':'opaque','flag':'https://fixture.test/'})['body']['header']['Referer']=='https://fixture.test/'
        proxy=invoke('proxy')['body'];assert proxy['binary'] and proxy['body']=='AP8Q' and proxy['headers']['X-Test']=='1'
        missing=invoke('home',key='missing',script='import localvideo_missing_native_extension')
        assert not missing['ok'] and 'localvideo_missing_native_extension' in missing['error']
        for i in range(4):
            assert invoke('home',key='evict-'+str(i))['ok']
        assert invoke('home')['body']['visits']==3
        import requests
        assert 'requirements.zip' in requests.__file__
        swallowed = '''
from base.spider import Spider as Base
import urllib.request, requests
class Spider(Base):
 def homeContent(self, filter):
  return {'class':[{'type_id':'1','type_name':'分类'}]}
 def homeVideoContent(self):
  try:
   urllib.request.build_opener().open(self.url+'/private-missing?token=secret',timeout=2).read()
  except Exception:
   pass
  return {'list':[]}
 def init(self, extend=''):
  self.url=extend
 def categoryContent(self, tid, pg, filter, extend):
  requests.get(self.url+'/unavailable?token=secret',timeout=2)
  return {'list':[]}
 def searchContent(self, keyword, quick):
  return {'list':[]}
'''
        warning=invoke('home',key='swallowed',script=swallowed)
        assert warning['ok'] and len(warning['body']['class'])==1,warning
        assert 'HTTP 404' in warning['body']['sourceWarning'],warning
        assert all(value not in warning['body']['sourceWarning'] for value in ['secret','private-missing','token','http://']),warning
        warning=invoke('category',{'id':'1'},key='swallowed',script=swallowed)
        assert 'HTTP 503' in warning['body']['sourceWarning'],warning
        clean=invoke('search',{'keyword':'empty'},key='swallowed',script=swallowed)
        assert clean['ok'] and 'sourceWarning' not in clean['body'],clean
        retry_script=swallowed.replace("urllib.request.build_opener().open(self.url+'/private-missing?token=secret',timeout=2).read()", "requests.get(self.url+'/retry',timeout=2)\n   requests.get(self.url+'/retry',timeout=2)")
        retried=invoke('home',key='retried',script=retry_script)
        assert retried['ok'] and 'sourceWarning' not in retried['body'],retried
        valid_script=swallowed.replace("return {'list':[]}","return {'list':[{'vod_id':'1','vod_name':'fallback'}]}")
        valid=invoke('home',key='valid',script=valid_script)
        assert valid['ok'] and valid['body']['list'] and 'sourceWarning' not in valid['body'],valid
        print('Python Spider contract, real HTTP/cookies/headers, cache isolation/persistence, binary proxy and missing-dependency checks passed')
        print('Swallowed urllib/requests failures, sanitized warnings, retry recovery and legitimate empty responses passed')
finally:
    server.shutdown()
    server.server_close()
