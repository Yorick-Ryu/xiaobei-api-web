#!/usr/bin/env node

const http = require('http');

const UPSTREAM = process.env.UPSTREAM || 'http://127.0.0.1:3000';
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3100);

const logoSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="56" fill="#101828"/>
  <path d="M62 171V85h28l76 86V85h28v86h-28L90 85v86H62z" fill="#fff"/>
  <path d="M68 188h120" stroke="#2dd4bf" stroke-width="14" stroke-linecap="round"/>
</svg>`.trim();

const logoDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(logoSvg)}`;

// Wallet UI on Novapi:
// - keep balance summary + redemption
// - keep "My Subscriptions" cards from /api/subscription/self
// - hide Ultra/Plus purchase plan cards (plans API returns empty)
// - hide online payment chrome and referral
const walletSlimScript = `
(function () {
  if (window.__novapiWalletSlimInstalled) return;
  window.__novapiWalletSlimInstalled = true;

  var style = document.createElement('style');
  style.textContent = [
    'body.novapi-wallet-slim #wallet-add-funds{max-width:760px}',
    'body.novapi-wallet-slim #wallet-add-funds [data-novapi-wallet-hidden="true"]{display:none!important}',
    'body.novapi-wallet-slim [data-novapi-wallet-hidden="true"]{display:none!important}',
    /* Keep redeem/code controls visible even if parent cleanup races. */
    'body.novapi-wallet-slim #wallet-add-funds #redemption-code,',
    'body.novapi-wallet-slim #wallet-add-funds input[id*="redemption" i],',
    'body.novapi-wallet-slim #wallet-add-funds input[placeholder*="redemption" i],',
    'body.novapi-wallet-slim #wallet-add-funds input[placeholder*="兑换" i]{display:block!important}',
    /* Hide empty purchase-plan placeholder when plans API is empty. */
    'body.novapi-wallet-slim [data-novapi-hide-no-plans="true"]{display:none!important}'
  ].join('\\n');
  document.head.appendChild(style);

  function isWalletPath() {
    var path = window.location.pathname.replace(/\\/+$/, '');
    return path === '/wallet' || path === '/console/topup';
  }

  function textOf(element) {
    return ((element && element.innerText) || '').replace(/\\s+/g, ' ').trim();
  }

  function isSubscriptionSection(element) {
    if (!element) return false;
    var text = textOf(element);
    if (!text) return false;
    // My subscriptions / subscription plans panel (not referral).
    if (/my subscriptions|subscription plans|我的订阅|订阅套餐|订阅计划/i.test(text)) return true;
    if (/billing preference|subscription first|wallet first|subscription only|wallet only|计费优先|订阅优先|钱包优先/i.test(text)) return true;
    if (/no active|active|expired|days remaining|next reset|total quota|无有效|剩余|下次重置|总额度/i.test(text) && /subscription|订阅/i.test(text)) return true;
    return false;
  }

  function isProtected(element) {
    if (!element || !element.closest) return false;
    // The summary is now a sibling of add-funds; protect it and its loading skeleton.
    if (element.closest('.grid.grid-cols-3.divide-x')) return true;
    if (element.id === 'wallet-add-funds') return true;
    if (element.closest('#wallet-add-funds #redemption-code')) return true;
    if (isSubscriptionSection(element) || element.closest('[data-novapi-subscription-section="true"]')) return true;
    var text = textOf(element);
    if (/redeem|redemption|兑换码|兑换|have a code|代码|code\\?/i.test(text) && element.querySelector && element.querySelector('input,button')) {
      return true;
    }
    return false;
  }

  function markHidden(element) {
    if (!element || isProtected(element)) return;
    // Never hide the whole add-funds card.
    if (element.id === 'wallet-add-funds') return;
    if (element.getAttribute && element.getAttribute('data-novapi-subscription-section') === 'true') return;
    if (element.closest && element.closest('#wallet-add-funds') && element.querySelector && element.querySelector('#redemption-code, input')) {
      var onlyPayment = !/redeem|redemption|兑换/i.test(element.innerText || '');
      if (!onlyPayment) return;
    }
    element.setAttribute('data-novapi-wallet-hidden', 'true');
  }

  function clearHidden() {
    document
      .querySelectorAll('[data-novapi-wallet-hidden="true"], [data-novapi-subscription-section="true"], [data-novapi-hide-no-plans="true"]')
      .forEach(function (element) {
        element.removeAttribute('data-novapi-wallet-hidden');
        element.removeAttribute('data-novapi-subscription-section');
        element.removeAttribute('data-novapi-hide-no-plans');
      });
  }

  function findCompactBlock(node, stopAt) {
    var current = node;
    while (current && current !== stopAt && current.parentElement !== stopAt) {
      if (current.id === 'wallet-add-funds') return node;
      if (current.getAttribute && current.getAttribute('data-novapi-subscription-section') === 'true') return node;
      var text = textOf(current);
      var controls = current.querySelectorAll
        ? current.querySelectorAll('input,button,[role="button"],select').length
        : 0;
      if (text.length > 0 && text.length < 280 && controls <= 3) return current;
      current = current.parentElement;
    }
    return node;
  }

  function hideTextMatches(root, patterns) {
    if (!root) return;
    var nodes = root.querySelectorAll('h1,h2,h3,h4,h5,p,span,label,button,div,li,section,article');
    nodes.forEach(function (node) {
      if (isProtected(node)) return;
      var text = textOf(node);
      if (!text || text.length > 280) return;
      // Keep redemption area and balance summary.
      if (/redeem|redemption|兑换码|兑换|have a code|余额|quota|balance|wallet/i.test(text) && !/payment method|stripe|alipay|wechat|creem|waffo|billing history/i.test(text)) {
        return;
      }
      // Keep my-subscription content.
      if (/my subscriptions|我的订阅|days remaining|next reset|total quota|billing preference|subscription first|wallet first|subscription only|wallet only/i.test(text)) {
        return;
      }
      if (patterns.some(function (pattern) { return pattern.test(text); })) {
        markHidden(findCompactBlock(node, root));
      }
    });
  }

  function markSubscriptionSections() {
    var addFunds = document.getElementById('wallet-add-funds');
    if (!addFunds || !addFunds.parentElement) return;

    Array.prototype.forEach.call(addFunds.parentElement.children, function (child) {
      if (child === addFunds) return;
      if (isSubscriptionSection(child)) {
        child.setAttribute('data-novapi-subscription-section', 'true');
      }
    });

    // Also mark standalone subscription cards elsewhere on the page.
    document.querySelectorAll('section,article,div').forEach(function (node) {
      if (node.id === 'wallet-add-funds') return;
      if (node.closest && node.closest('#wallet-add-funds')) return;
      if (node.getAttribute('data-novapi-subscription-section') === 'true') return;
      var text = textOf(node);
      if (!text || text.length > 4000) return;
      if (/my subscriptions|我的订阅/i.test(text) && /subscription|订阅/i.test(text)) {
        // Prefer a reasonably sized card, not the whole page.
        if (text.length < 2500) {
          node.setAttribute('data-novapi-subscription-section', 'true');
        }
      }
    });
  }

  function hidePurchasePlanChrome(root) {
    if (!root) return;

    // Hide "No plans available" when we intentionally return empty plans.
    root.querySelectorAll('p,div,span').forEach(function (node) {
      var text = textOf(node);
      if (!text || text.length > 80) return;
      if (/^no plans available$|^暂无可用套餐$|^没有可用套餐$|^暂无套餐$/i.test(text)) {
        node.setAttribute('data-novapi-hide-no-plans', 'true');
      }
    });

    // Hide any leftover purchase plan cards (Ultra/Plus monthly etc.).
    root.querySelectorAll('button,a,[role="button"]').forEach(function (node) {
      var text = textOf(node);
      if (!/subscribe now|立即订阅|购买套餐|订阅此套餐/i.test(text)) return;
      var card = node.closest('.rounded-xl, .rounded-lg, [class*="card"], div');
      if (card && !isProtected(card)) markHidden(card);
    });

    hideTextMatches(root, [
      /subscribe now/i,
      /purchase a plan/i,
      /recommended/i,
      /ultra\\s*月卡/i,
      /plus\\s*月卡/i,
      /ultra\\s*季卡/i,
      /立即订阅/,
      /购买套餐/,
      /推荐套餐/
    ]);
  }

  function keepBalanceRedeemAndMySubscriptions() {
    clearHidden();
    document.body.classList.toggle('novapi-wallet-slim', isWalletPath());
    if (!isWalletPath()) return;

    markSubscriptionSections();

    var addFunds = document.getElementById('wallet-add-funds');
    if (addFunds) {
      var grid = addFunds.parentElement;
      if (grid) {
        Array.prototype.forEach.call(grid.children, function (child) {
          if (child === addFunds) return;
          if (child.getAttribute('data-novapi-subscription-section') === 'true') return;
          if (isSubscriptionSection(child)) {
            child.setAttribute('data-novapi-subscription-section', 'true');
            return;
          }
          markHidden(child);
        });
      }

      var container = grid && grid.parentElement;
      if (container) {
        Array.prototype.forEach.call(container.children, function (child, index) {
          // Keep the first summary/balance block and the funds/subscription grid.
          if (index === 0 || child === grid) return;
          if (child.getAttribute('data-novapi-subscription-section') === 'true') return;
          if (isSubscriptionSection(child)) {
            child.setAttribute('data-novapi-subscription-section', 'true');
            return;
          }
          markHidden(child);
        });
      }

      // Hide online payment chrome, but never the whole card.
      hideTextMatches(addFunds, [
        /billing history/i,
        /view.*transaction/i,
        /payment method/i,
        /payment amount/i,
        /custom amount/i,
        /select amount/i,
        /choose an amount/i,
        /online top\\s*-?\\s*up/i,
        /stripe/i,
        /alipay/i,
        /wechat/i,
        /creem/i,
        /waffo/i,
        /amount to pay/i,
        /no payment methods available/i,
        /充值金额/,
        /支付方式/,
        /支付金额/,
        /交易记录/,
        /账单记录/
      ]);
    }

    document.querySelectorAll('[data-novapi-subscription-section="true"]').forEach(function (section) {
      hidePurchasePlanChrome(section);
    });

    // Hide referral and leftover purchase marketing outside protected sections.
    hideTextMatches(document.body, [
      /referral program/i,
      /earn rewards when your referrals/i,
      /推荐计划/,
      /邀请好友/,
      /推荐奖励/
    ]);
  }

  var scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(function () {
      scheduled = false;
      keepBalanceRedeemAndMySubscriptions();
    });
  }

  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    history[name] = function () {
      var result = original.apply(this, arguments);
      scheduleApply();
      return result;
    };
  });

  window.addEventListener('popstate', scheduleApply);
  new MutationObserver(scheduleApply).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  scheduleApply();
})();
`.trim();

function updateJsonString(value, updater) {
  if (typeof value !== 'string' || !value) return value;

  try {
    const parsed = JSON.parse(value);
    return JSON.stringify(updater(parsed));
  } catch {
    return value;
  }
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

function applyNovapiBrand(payload) {
  if (!payload || typeof payload !== 'object' || !payload.data) return payload;

  payload.data.system_name = 'Novapi';
  let nav = {};
  try { nav = JSON.parse(payload.data.HeaderNavModules || '{}'); } catch {}
  payload.data.HeaderNavModules = JSON.stringify({
    ...nav,
    plans: { enabled: false, requireAuth: true },
  });
  if (Array.isArray(payload.data.announcements)) {
    payload.data.announcements = payload.data.announcements.filter(
      (item) => !isSubscriptionAnnouncement(item) && !isCampusPartnerAnnouncement(item),
    );
  }

  payload.data.logo = logoDataUrl;
  payload.data.server_address = 'https://api.novapi.cn';
  payload.data.api_address = 'https://api.novapi.cn';
  payload.data.docs_link = 'https://my.feishu.cn/wiki/KCR6wTntxizbNVkvPVgcRwcBnkc';
  payload.data.github_oauth = false;
  payload.data.github_client_id = '';
  payload.data.passkey_login = false;

  if (Array.isArray(payload.data.api_info)) {
    payload.data.api_info = payload.data.api_info.map((item) => ({
      ...item,
      url: item && item.url === 'https://api.beiapi.cn/v1'
        ? 'https://api.novapi.cn/v1'
        : item.url,
    }));
  }

  payload.data.passkey_display_name = 'Novapi';
  payload.data.passkey_origins = '';
  payload.data.passkey_rp_id = '';

  // FAQ/常见问答: show on beiapi, hide on novapi.
  payload.data.faq_enabled = false;
  payload.data.faq = [];

  payload.data.SidebarModulesAdmin = updateJsonString(
    payload.data.SidebarModulesAdmin,
    (modules) => ({
      ...modules,
      personal: {
        ...(modules && modules.personal && typeof modules.personal === 'object'
          ? modules.personal
          : {}),
        topup: true,
      },
      admin: {
        ...(modules && modules.admin && typeof modules.admin === 'object'
          ? modules.admin
          : {}),
        subscription: false,
      },
    }),
  );

  return payload;
}

function applyNovapiTopupInfo(payload) {
  if (!payload || typeof payload !== 'object' || !payload.data) return payload;

  payload.data.pay_methods = [];
  payload.data.amount_options = [];
  payload.data.discount = {};
  payload.data.creem_products = [];
  payload.data.waffo_pay_methods = [];
  payload.data.topup_link = '';
  payload.data.enable_online_topup = false;
  payload.data.enable_stripe_topup = false;
  payload.data.enable_creem_topup = false;
  payload.data.enable_waffo_topup = false;
  payload.data.enable_waffo_pancake_topup = false;
  // New frontend gates redemption with enable_redemption !== false.
  // Keep explicit true so wallet redeem remains usable on Novapi.
  payload.data.enable_redemption = true;
  if (payload.data.payment_compliance_confirmed === undefined) {
    payload.data.payment_compliance_confirmed = true;
  }

  return payload;
}

function pickForwardHeaders(req) {
  const headers = {
    accept: req.headers.accept || 'application/json',
    'user-agent': req.headers['user-agent'] || 'novapi-brand-proxy',
  };

  // Forward auth material so /api/subscription/self can resolve the user.
  const passthrough = [
    'cookie',
    'authorization',
    'new-api-user',
    'new-api-token',
    'x-requested-with',
    'content-type',
  ];

  for (const name of passthrough) {
    const value = req.headers[name];
    if (value) headers[name] = value;
  }

  return headers;
}

async function proxyJson(req, res, upstreamPath, options = {}) {
  try {
    const method = options.method || req.method || 'GET';
    const init = {
      method,
      headers: pickForwardHeaders(req),
    };

    if (method !== 'GET' && method !== 'HEAD' && options.body !== undefined) {
      init.body = options.body;
    }

    const upstream = await fetch(`${UPSTREAM}${upstreamPath}`, init);
    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';

    res.writeHead(upstream.status, {
      'content-type': contentType,
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(text),
    });
    res.end(text);
  } catch (error) {
    const body = JSON.stringify({
      success: false,
      message: 'Novapi brand proxy upstream failed',
    });
    res.writeHead(502, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
    });
    res.end(body);
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handleStatus(req, res) {
  try {
    const upstream = await fetch(`${UPSTREAM}/api/status`, {
      headers: {
        accept: req.headers.accept || 'application/json',
        'user-agent': req.headers['user-agent'] || 'novapi-brand-proxy',
      },
    });

    const text = await upstream.text();
    const payload = applyNovapiBrand(JSON.parse(text));
    const body = JSON.stringify(payload);

    res.writeHead(upstream.status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    });
    res.end(body);
  } catch (error) {
    const body = JSON.stringify({
      success: false,
      message: 'Novapi brand proxy failed',
    });
    res.writeHead(502, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
    });
    res.end(body);
  }
}

async function handleTopupInfo(req, res) {
  const payload = applyNovapiTopupInfo({
    success: true,
    message: '',
    data: {
      pay_methods: [],
      amount_options: [],
      discount: {},
      creem_products: [],
      waffo_pay_methods: [],
      topup_link: '',
      enable_online_topup: false,
      enable_stripe_topup: false,
      enable_creem_topup: false,
      enable_waffo_topup: false,
      enable_waffo_pancake_topup: false,
      enable_redemption: true,
      payment_compliance_confirmed: true,
      min_topup: 1,
      price: 1,
    },
  });
  sendJson(res, 200, payload);
}

async function handleSubscriptionPlans(req, res) {
  // Keep empty so Ultra/Plus purchase cards do not render on Novapi wallet.
  // Users still see "My Subscriptions" via /api/subscription/self.
  sendJson(res, 200, {
    success: true,
    message: '',
    data: [],
  });
}

async function handleSubscriptionSelf(req, res) {
  // Proxy real user subscription cards from New API.
  // Soft-handle unauthenticated wallet loads to avoid frontend error toasts.
  try {
    const upstream = await fetch(`${UPSTREAM}/api/subscription/self`, {
      method: 'GET',
      headers: pickForwardHeaders(req),
    });
    const text = await upstream.text();
    if (upstream.status === 401 || upstream.status === 403) {
      sendJson(res, 200, {
        success: true,
        message: '',
        data: {
          billing_preference: 'wallet_first',
          subscriptions: [],
          all_subscriptions: [],
        },
      });
      return;
    }

    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    res.writeHead(upstream.status, {
      'content-type': contentType,
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(text),
    });
    res.end(text);
  } catch (error) {
    sendJson(res, 200, {
      success: true,
      message: '',
      data: {
        billing_preference: 'wallet_first',
        subscriptions: [],
        all_subscriptions: [],
      },
    });
  }
}

async function handleSubscriptionPreference(req, res) {
  // Allow billing preference changes so My Subscriptions UI remains usable.
  const body = await readRequestBody(req);
  await proxyJson(req, res, '/api/subscription/self/preference', {
    method: 'PUT',
    body,
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/status') {
    handleStatus(req, res);
    return;
  }

  if (req.method === 'GET' && req.url === '/api/user/topup/info') {
    handleTopupInfo(req, res);
    return;
  }

  if (req.method === 'GET' && req.url === '/api/subscription/plans') {
    handleSubscriptionPlans(req, res);
    return;
  }

  if (req.method === 'GET' && req.url === '/api/subscription/self') {
    handleSubscriptionSelf(req, res);
    return;
  }

  if (
    req.method === 'PUT' &&
    (req.url === '/api/subscription/self/preference' ||
      req.url.startsWith('/api/subscription/self/preference?'))
  ) {
    handleSubscriptionPreference(req, res);
    return;
  }

  if (req.method === 'GET' && req.url === '/api/home_page_content') {
    sendJson(res, 200, {
      data: 'https://home.novapi.cn',
      message: '',
      success: true,
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/logo.png') {
    res.writeHead(200, {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'content-length': Buffer.byteLength(logoSvg),
    });
    res.end(logoSvg);
    return;
  }

  if (req.method === 'GET' && req.url === '/novapi-wallet.js') {
    res.writeHead(200, {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(walletSlimScript),
    });
    res.end(walletSlimScript);
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found\n');
});

if (require.main === module) server.listen(PORT, HOST, () => {
  console.log(`novapi-brand-proxy listening on http://${HOST}:${PORT}`);
});

module.exports = { server, applyNovapiBrand };
