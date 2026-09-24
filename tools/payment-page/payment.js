/* CommuneWorld payment page. The mobile app opens /payments?token=<64 hex> in a
   webview; this script turns that one-time token into a Cashfree order and opens
   Cashfree checkout in the same webview. It owns exactly two steps -- create the
   order, open checkout -- and never decides whether a payment succeeded: Cashfree
   redirects to the API's return URL, the app intercepts it and verifies.

   The token is a one-time payment credential. It is never logged, stored, or
   handed to anything other than the create-order request. */
(function () {
  'use strict';

  var TOKEN_PATTERN = /^[a-f0-9]{64}$/;
  var CASHFREE_SDK_URL = 'https://sdk.cashfree.com/js/v3/cashfree.js';
  var CREATE_ORDER_PATH = '/api/payment/cashfree/create-order';
  var REQUEST_TIMEOUT_MS = 20000;
  var RATE_LIMIT_WAIT_S = 60;

  var BACK_TO_APP = 'Close this screen to go back to the CommuneWorld app.';
  var GENERIC_MESSAGE = 'Something went wrong. Please go back to the app and try again.';
  var EXPIRED_MESSAGE = 'This payment link has expired. Please go back to the app and start the payment again.';
  var CHECKOUT_FAILED = "We couldn't open the secure checkout. Check your connection and tap Pay again, or go back to the app.";

  var body = document.body;
  var apiBase = (body.getAttribute('data-api-base') || '').replace(/\/+$/, '');
  var mode = body.getAttribute('data-cashfree-mode');
  var card = document.getElementById('pay-card');

  function el(id) { return document.getElementById(id); }

  var panels = Array.prototype.slice.call(card.querySelectorAll('[data-panel]'));
  var payButton = el('pay-button');
  var retryButton = el('retry-button');
  var inlineError = el('pay-inline-error');

  var order = null;       /* the validated create-order response data */
  var opening = false;    /* checkout() in flight -- blocks a double tap */
  var countdown = null;   /* 429 retry timer */

  function show(name) {
    panels.forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-panel') !== name;
    });
    card.setAttribute('aria-busy', name === 'loading' ? 'true' : 'false');
  }

  function formatMoney(value, currency) {
    var whole = Math.round(value * 100) % 100 === 0;
    var digits = whole ? 0 : 2;
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: currency || 'INR',
        minimumFractionDigits: digits, maximumFractionDigits: digits
      }).format(value);
    } catch (e) {
      return (!currency || currency === 'INR' ? '₹' : currency + ' ') + value.toFixed(digits);
    }
  }

  function formatCount(value) {
    try { return new Intl.NumberFormat('en-IN').format(value); } catch (e) { return String(value); }
  }

  function toNumber(value) {
    var n = typeof value === 'string' ? Number(value.trim()) : value;
    return typeof n === 'number' && isFinite(n) ? n : null;
  }

  /* ---- error states (§5 of docs/cashfree_integration.md) ---- */

  function stopCountdown() {
    if (countdown) { clearInterval(countdown); countdown = null; }
  }

  /* retry: 'none' | 'now' | 'wait' (429: enabled only after RATE_LIMIT_WAIT_S). */
  function showError(opts) {
    stopCountdown();
    card.setAttribute('data-tone', opts.tone || 'problem');
    el('error-kicker').textContent = opts.kicker || 'Payment';
    el('error-title').textContent = opts.title;
    /* Server messages are written for the end user and shown verbatim -- as text, never markup. */
    el('error-message').textContent = opts.message;
    el('error-hint').textContent = opts.hint || BACK_TO_APP;

    retryButton.hidden = opts.retry === 'none' || !opts.retry;
    retryButton.disabled = false;
    retryButton.textContent = 'Try again';
    if (opts.retry === 'wait') {
      var left = RATE_LIMIT_WAIT_S;
      retryButton.disabled = true;
      retryButton.textContent = 'Try again in ' + left + 's';
      countdown = setInterval(function () {
        left -= 1;
        if (left > 0) {
          retryButton.textContent = 'Try again in ' + left + 's';
          return;
        }
        stopCountdown();
        retryButton.disabled = false;
        retryButton.textContent = 'Try again';
      }, 1000);
    }
    show('error');
  }

  function showExpired(message) {
    showError({
      kicker: 'Link expired',
      title: 'This payment link is no longer valid',
      message: message || EXPIRED_MESSAGE,
      hint: 'Go back to the CommuneWorld app and start the payment again. The app will create a fresh link.',
      retry: 'none'
    });
  }

  function showGeneric(canRetry) {
    showError({ title: 'Something went wrong', message: GENERIC_MESSAGE, retry: canRetry ? 'now' : 'none' });
  }

  function handleFailure(status, message) {
    switch (status) {
      case 400:
      case 404:
      case 410:
        return showExpired(message);
      case 409:
        /* Already paid. Checkout must never open for this token. */
        return showError({
          tone: 'done',
          kicker: 'Payment complete',
          title: 'This payment is already complete',
          message: message || 'This payment has already been completed.',
          hint: 'Return to the CommuneWorld app to continue. ' + BACK_TO_APP,
          retry: 'none'
        });
      case 429:
        return showError({
          title: 'Too many attempts',
          message: message || 'Too many payment attempts. Please wait a minute and try again.',
          retry: 'wait'
        });
      case 503:
        return showError({
          title: 'Payments are unavailable',
          message: message || 'Online payment is not available right now. Please try again later from the app.',
          retry: 'none'
        });
      default:
        /* Other 4xx: the server's own message if it sent one. 5xx and unreadable
           responses: the generic line. Retrying is harmless -- create-order is
           idempotent per token. */
        if (status >= 400 && status < 500 && message) return showError({ title: 'Payment could not start', message: message, retry: 'none' });
        return showGeneric(true);
    }
  }

  /* ---- step 3: create the order ---- */

  function createOrder(token) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, REQUEST_TIMEOUT_MS);

    var request = fetch(apiBase + CREATE_ORDER_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ checkout_token: token }),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller ? controller.signal : undefined
    });

    return request.then(function (response) {
      return response.json().then(
        function (payload) { return { status: response.status, ok: response.ok, payload: payload }; },
        function () { return { status: response.status, ok: false, payload: null }; }
      );
    }).then(function (result) {
      clearTimeout(timer);
      return result;
    }, function (error) {
      clearTimeout(timer);
      throw error;
    });
  }

  /* Returns the fields the page needs, or null if the response is not usable. */
  function readOrder(payload) {
    var data = payload && payload.success === true && payload.data;
    if (!data || typeof data.payment_session_id !== 'string' || !data.payment_session_id) return null;
    var amount = toNumber(data.amount);
    if (amount === null || amount <= 0) return null;
    return {
      sessionId: data.payment_session_id,
      amount: amount,
      baseAmount: toNumber(data.base_amount),
      gstAmount: toNumber(data.gst_amount),
      gstPercent: toNumber(data.gst_percent),
      currency: typeof data.currency === 'string' && /^[A-Z]{3}$/.test(data.currency) ? data.currency : 'INR',
      purpose: data.purpose,
      credits: toNumber(data.credits_to_be_added)
    };
  }

  function renderOrder(o) {
    var total = formatMoney(o.amount, o.currency);

    if (o.purpose === 'registration') {
      el('pay-kicker').textContent = 'Registration';
      el('pay-title').textContent = 'Registration fee';
    } else if (o.purpose === 'credit_recharge') {
      el('pay-kicker').textContent = 'Top-up';
      el('pay-title').textContent = 'Add credits';
    } else {
      el('pay-kicker').textContent = 'Payment';
      el('pay-title').textContent = 'CommuneWorld payment';
    }

    var credits = el('pay-credits');
    credits.hidden = !(o.purpose === 'credit_recharge' && o.credits !== null && o.credits > 0);
    if (!credits.hidden) credits.textContent = formatCount(o.credits) + ' credits will be added to your account';

    el('pay-amount').textContent = total;
    el('pay-amount-note').textContent = o.gstPercent !== null
      ? 'Includes ' + formatCount(o.gstPercent) + '% GST' : 'Includes GST';

    /* The breakdown is shown only when it is present and adds up; `amount` is
       what gets charged either way. */
    var breakdown = el('pay-breakdown');
    var consistent = o.baseAmount !== null && o.gstAmount !== null &&
      Math.abs(o.baseAmount + o.gstAmount - o.amount) < 0.01;
    breakdown.hidden = !consistent;
    if (consistent) {
      el('pay-base').textContent = formatMoney(o.baseAmount, o.currency);
      el('pay-gst-label').textContent = o.gstPercent !== null ? 'GST (' + formatCount(o.gstPercent) + '%)' : 'GST';
      el('pay-gst').textContent = formatMoney(o.gstAmount, o.currency);
      el('pay-total').textContent = total;
    }

    resetPayButton();
    inlineError.hidden = true;
    card.removeAttribute('data-tone');
    show('ready');
  }

  function start() {
    var token = new URLSearchParams(window.location.search).get('token');
    if (!token || !TOKEN_PATTERN.test(token)) return showExpired();
    if (typeof fetch !== 'function' || typeof Promise !== 'function') return showGeneric(false);

    stopCountdown();
    show('loading');
    loadSdk();

    createOrder(token).then(function (result) {
      if (!result.ok) {
        var message = result.payload && typeof result.payload.message === 'string'
          ? result.payload.message.trim() : '';
        return handleFailure(result.status, message);
      }
      order = readOrder(result.payload);
      if (!order) return showGeneric(true);
      renderOrder(order);
    }, function () {
      /* Network failure or timeout. */
      showGeneric(true);
    });
  }

  /* ---- step 4: open Cashfree checkout ---- */

  /* The SDK is loaded by the page itself (not a static tag) so a failed load can
     be retried on the next tap instead of stranding the user. */
  var sdkPromise = null;
  function loadSdk() {
    if (typeof window.Cashfree === 'function') return Promise.resolve(window.Cashfree);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = CASHFREE_SDK_URL;
      script.async = true;
      script.onload = function () {
        if (typeof window.Cashfree === 'function') resolve(window.Cashfree);
        else fail();
      };
      script.onerror = fail;
      function fail() {
        if (script.parentNode) script.parentNode.removeChild(script);
        sdkPromise = null;
        reject(new Error('Cashfree SDK unavailable'));
      }
      document.head.appendChild(script);
    });
    /* Swallow here; the Pay tap reports it. */
    sdkPromise.catch(function () {});
    return sdkPromise;
  }

  function resetPayButton() {
    opening = false;
    payButton.disabled = false;
    payButton.textContent = order ? 'Pay ' + formatMoney(order.amount, order.currency) : 'Pay';
  }

  function checkoutFailed() {
    resetPayButton();
    inlineError.textContent = CHECKOUT_FAILED;
    inlineError.hidden = false;
  }

  function openCheckout() {
    if (opening || !order) return;
    opening = true;
    inlineError.hidden = true;
    payButton.disabled = true;
    payButton.textContent = 'Opening secure checkout…';

    loadSdk().then(function (Cashfree) {
      var cashfree = Cashfree({ mode: mode });
      /* '_self' keeps checkout in this webview, where the app watches navigation.
         The return URL is set by the server; the page never passes one. */
      return cashfree.checkout({ paymentSessionId: order.sessionId, redirectTarget: '_self' });
    }).then(function (outcome) {
      /* On success the SDK navigates away; an { error } result means it did not. */
      if (outcome && outcome.error) checkoutFailed();
    }, checkoutFailed);
  }

  payButton.addEventListener('click', openCheckout);
  retryButton.addEventListener('click', start);

  /* Back from Cashfree via a restored page (bfcache): the button would still read
     "Opening…". Put it back so the user can pay again or leave. */
  window.addEventListener('pageshow', function (event) {
    if (event.persisted && order) resetPayButton();
  });

  start();
})();
