const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const UPSTREAM = new URL(process.env.UPSTREAM || 'http://127.0.0.1:3000');
const PORT = Number(process.env.PORT || 3101);
const ORIGIN = process.env.PUBLIC_ORIGIN || '';
const API_ORIGIN = process.env.API_ORIGIN || ORIGIN;
const DOCS = 'https://icnhp8mbc5f6.feishu.cn/wiki/O0s2wWBSUicgmNkxTBbcZ0fjnQZ?from=from_copylink';
const files = {
  '/bingdian/brand.js': ['brand.js', 'application/javascript; charset=utf-8'],
  '/bingdian/brand.css': ['brand.css', 'text/css; charset=utf-8'],
  '/bingdian/support-qr.png': ['support-qr.png', 'image/png'],
  '/logo.png': ['logo.svg', 'image/svg+xml'],
  '/favicon.ico': ['logo.svg', 'image/svg+xml'],
};
function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, {'content-type': type, 'cache-control': 'no-store', 'content-length': Buffer.byteLength(body)});
  res.end(body);
}
// Audited subscription notices remain hidden even if their wording changes.
const subscriptionAnnouncementIds = new Set([6, 7, 9, 10]);
// BeiAPI-only campaign: keep the published notice hidden after copy edits too.
const campusPartnerAnnouncementIds = new Set([13]);
function isCampusPartnerAnnouncement(item) {
  if (campusPartnerAnnouncementIds.has(Number(item?.id))) return true;
  const text = [item?.content, item?.extra].filter((value) => typeof value === 'string').join('\n');
  return /校园\s*合伙人|\bcampus[\s-]+partners?\b|\/campus-partner(?:[\/?#\s]|$)/i.test(text);
}

function isSubscriptionAnnouncement(item) {
  if (subscriptionAnnouncementIds.has(Number(item?.id))) return true;
  const text = [item?.content, item?.extra].filter((value) => typeof value === 'string').join('\n');
  return /订阅|套餐|月卡|季卡|年卡|\bsubscriptions?\b/i.test(text);
}

function transformStatus(payload) {
  if (!payload?.data) return payload;
  const d = payload.data;
  if (Array.isArray(d.announcements)) {
    d.announcements = d.announcements.filter(
      (item) => !isSubscriptionAnnouncement(item) && !isCampusPartnerAnnouncement(item),
    );
  }

  Object.assign(d, {system_name:'冰点科研API', logo:'/logo.png', docs_link:DOCS,
    github_oauth:false, github_client_id:'', passkey_login:false,
    passkey_rp_id:'', passkey_origins:'', passkey_display_name:'冰点科研API',
    faq_enabled:false, faq:[]});
  if (ORIGIN) {
    d.server_address = API_ORIGIN;
    d.api_address = API_ORIGIN;
    d.api_info = [{id:1,color:'blue',route:'API 地址',description:'通用接口',url:API_ORIGIN + '/v1'}];
  }
  let nav = {};
  try { nav = JSON.parse(d.HeaderNavModules || '{}'); } catch {}
  d.HeaderNavModules = JSON.stringify({...nav, plans:{enabled:false,requireAuth:true}, pricing:{enabled:true,requireAuth:false}, docs:true});
  return payload;
}
function transformTopup(payload) {
  if (!payload?.data) return payload;
  const d = payload.data;
  for (const k of Object.keys(d)) if (k.startsWith('enable_') && k.endsWith('topup')) d[k] = false;
  Object.assign(d, {pay_methods:[],creem_products:[],waffo_pay_methods:[],topup_link:''});
  // Preserve amount_options, discount, redemption and compliance from the source.
  return payload;
}
function blocked(p) {
  return /^\/api\/user\/(?:pay|(?:stripe|creem|waffo|waffo-pancake)\/pay)(?:\/|$)/.test(p) ||
    /^\/api\/subscription\/(?:balance|epay|stripe|creem|waffo-pancake)\/pay(?:\/|$)/.test(p);
}
function createServer() {
 return http.createServer((req,res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/{2,}/g,'/'); }
  catch { return send(res,400,'{"success":false}'); }
  if (blocked(pathname)) return send(res,403,JSON.stringify({success:false,message:'充值请联系客服获取兑换码'}));
  if (files[pathname] && ['GET','HEAD'].includes(req.method)) {
    const [file,type] = files[pathname]; return send(res,200,fs.readFileSync(path.join(__dirname,'public',file)),type);
  }
  if (req.method === 'GET' && pathname === '/api/home_page_content') return send(res,200,JSON.stringify({success:true,data:'',message:''}));
  if (req.method === 'GET' && pathname === '/api/subscription/plans') return send(res,200,JSON.stringify({success:true,data:[],message:''}));
  const jsonTransform = req.method === 'GET' && (pathname === '/api/status' ? transformStatus : pathname === '/api/user/topup/info' ? transformTopup : null);
  const headers = {...req.headers,host:UPSTREAM.host};
  delete headers.connection;
  // Only HTML and transformed JSON need decoding; ordinary assets remain compressed.
  const htmlCandidate = !/^\/(api|v1|v1beta|static|assets)(\/|$)/.test(pathname);
  if (jsonTransform || htmlCandidate) { delete headers['accept-encoding']; delete headers['if-none-match']; delete headers['if-modified-since']; }
  const upstream = http.request({hostname:UPSTREAM.hostname,port:UPSTREAM.port || 80,path:req.url,method:req.method,headers}, response => {
    const isHtml = htmlCandidate && /text\/html/.test(response.headers['content-type'] || '');
    if (!jsonTransform && !isHtml) {res.writeHead(response.statusCode,response.headers);response.pipe(res);return;}
    const chunks=[]; let size=0;
    response.on('data', c => {size+=c.length; if(size>4*1024*1024) upstream.destroy(new Error('Response too large')); else chunks.push(c);});
    response.on('end',() => {
      try {
        let body=Buffer.concat(chunks).toString('utf8');
        if (jsonTransform) body=JSON.stringify(jsonTransform(JSON.parse(body)));
        if (isHtml) body=body.replace('<title>New API</title>','<title>冰点科研API</title>').replace('<head>','<head><link rel="stylesheet" href="/bingdian/brand.css"><script src="/bingdian/brand.js"></script>');
        const out={...response.headers,'content-length':Buffer.byteLength(body),'cache-control':'no-store'};
        for(const k of ['content-encoding','transfer-encoding','etag','content-length']) delete out[k];
        out['content-length']=Buffer.byteLength(body);
        res.writeHead(response.statusCode,out);res.end(body);
      } catch { if(!res.headersSent) send(res,502,'{"success":false,"message":"品牌服务暂不可用"}'); }
    });
  });
  upstream.setTimeout(30000,()=>upstream.destroy(new Error('Upstream timeout')));
  upstream.on('error',()=>{if(!res.headersSent) send(res,502,'{"success":false,"message":"服务暂不可用"}');else res.destroy();});
  req.on('aborted',()=>upstream.destroy());
  req.pipe(upstream);
 });
}
if(require.main===module) createServer().listen(PORT,'127.0.0.1',()=>console.log(`Bingdian preview listening on 127.0.0.1:${PORT}`));
module.exports={createServer,transformStatus,transformTopup,blocked};
