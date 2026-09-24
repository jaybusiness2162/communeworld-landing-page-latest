# Web prompt: the communeworld.com payment page (Cashfree web checkout)

> Hand this to the team that builds communeworld.com. It describes one page and the single API
> call it makes. The backend is done; nothing here needs a backend change.

|                         |                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| **What**                | A page at the URL set in `CASHFREE_CHECKOUT_PAGE_URL` (e.g. `https://communeworld.com/payments`) |
| **Who opens it**        | The CommuneWorld mobile app, **inside a webview**, never a user typing it                        |
| **What it does**        | Reads a token from the URL, creates the Cashfree order, opens Cashfree checkout                  |
| **What it does NOT do** | Decide whether the payment succeeded. The app does that after Cashfree redirects                 |

---

## 1. The whole flow, and where the page sits

```
1. App  → backend   asks for a checkout link          ← not the page's job
2. App  → webview   opens  https://communeworld.com/payments?token=<64 hex chars>
3. Page → backend   POST /api/payment/cashfree/create-order { checkout_token }
4. Page → Cashfree  cashfree.checkout({ paymentSessionId, redirectTarget: '_self' })
5. Cashfree → the return URL on the API server  ← the app intercepts this and closes the webview
6. App  → backend   verifies the payment and shows the result   ← not the page's job
```

The page owns **steps 3 and 4 only**. It never sees the user's login token, and it never needs
to know who the user is: the token carries that.

---

## 2. Read the token

```js
const token = new URLSearchParams(window.location.search).get('token');
```

It is **64 lowercase hex characters**. If it is missing or not that shape, show the "link
expired" state (§5) without calling the API.

**The token is a one-time payment credential.** Do not log it, send it to analytics, or put it
in any third-party script's reach. Serve the page with:

```
Referrer-Policy: no-referrer
Cache-Control: no-store
```

Keep third-party scripts off this page apart from Cashfree's own SDK.

---

## 3. Create the order: one API call

```
POST {API_BASE}/api/payment/cashfree/create-order
Content-Type: application/json

{ "checkout_token": "<token>" }
```

No `Authorization` header. CORS is open on the API, so a browser `fetch` works.

### 201: success

```jsonc
{
  "success": true,
  "message": "Payment order created successfully",
  "data": {
    "order_id": "cf_reg_12_1727170000000",
    "payment_session_id": "session_xxxxxxxx", // ← hand THIS to Cashfree
    "provider": "cashfree",
    "cf_order_id": "2024092400001",
    "amount": 1180, // what the user is charged, GST included, in RUPEES
    "base_amount": 1000,
    "gst_percent": 18,
    "gst_amount": 180,
    "currency": "INR",
    "purpose": "registration", // or "credit_recharge"
    "credits_to_be_added": 1000, // top-ups only
  },
}
```

- **Show `amount`.** It already includes GST. Never multiply by 100; there is no paise
  anywhere in this flow.
- `purpose` picks the heading: `registration` → "Registration fee", `credit_recharge` → "Add
  credits" (and show `credits_to_be_added`).
- **Calling this again with the same token is safe.** A reload returns the **same** order and
  the same `payment_session_id`; it never opens a second charge. So create the order on page
  load, and simply call again on reload.

---

## 4. Open Cashfree checkout

Use Cashfree's JS SDK v3 (script tag or the `@cashfreepayments/cashfree-js` npm package):

```html
<script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
```

```js
const cashfree = Cashfree({ mode: CASHFREE_MODE }); // "sandbox" | "production"
cashfree.checkout({
  paymentSessionId: data.payment_session_id,
  redirectTarget: '_self', // stay in the same webview tab; do NOT open a popup
});
```

- **`mode` must match the backend.** Sandbox sessions only open in sandbox mode and production
  sessions only in production mode. Make it a build-time env var per environment.
- **`redirectTarget: '_self'` is required.** The app watches the webview's navigation; a
  popup or new tab escapes it.
- The **return URL is set by the server**, not by the page. When the payment ends (success,
  failure or cancel), Cashfree navigates to `…/api/payment/cashfree/return?order_id=…`. The app
  intercepts that URL. Do not try to add a `returnUrl` on the page.
- A "Pay ₹1,180" button before calling `checkout()` is fine and recommended, so the user sees
  the amount first. Auto-opening on load is also acceptable.

---

## 5. Errors from create-order

Every error has the shape `{ success: false, message, errors? }`. **Show `message` as it is.**
It is written for the end user.

| Status          | Meaning                                            | What to show                                                                  |
| --------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `400`           | Token missing or malformed                         | `message` ("This payment link has expired…") and a hint to go back to the app |
| `404`           | Unknown token                                      | Same as 400                                                                   |
| `410`           | Link expired (30 minutes after the app created it) | Same. The app must create a new link                                          |
| `409`           | This payment is **already complete**               | `message` + "Return to the app". **Do not** open checkout                     |
| `429`           | Too many payment attempts from this network        | `message`; no retry button for a minute                                       |
| `503`           | Online payment switched off on the server          | `message`; no retry                                                           |
| `500` / network | Unexpected                                         | A generic "Something went wrong. Please go back to the app and try again."    |

There is no "retry payment" logic on the page. For anything but a network hiccup, the answer is
to go back to the app, which asks for a fresh link.

---

## 6. Webview constraints

- The page runs inside an **Android/iOS webview**, usually full-screen, with no browser chrome.
  Design for a phone, with a single column and large tap targets.
- **Do not use `window.open`, `target="_blank"` or popups.**
- Cookies and `localStorage` may be empty or wiped between opens. The page must work from the
  URL alone.
- UPI apps are opened by the app catching `upi://` / `intent://` links, so leave Cashfree's UPI
  intent flow alone. Do not rewrite those links.

---

## 7. Checklist

- [ ] Page reads `token` from the query string and validates `^[a-f0-9]{64}$`
- [ ] `POST /api/payment/cashfree/create-order { checkout_token }` on load; safe on reload
- [ ] Shows `amount` (rupees, GST included) and a heading by `purpose`
- [ ] `Cashfree({ mode })` per environment; `checkout({ paymentSessionId, redirectTarget: '_self' })`
- [ ] Every error status in §5 handled; `message` shown verbatim
- [ ] `Referrer-Policy: no-referrer`, `Cache-Control: no-store`; the token is never logged
- [ ] No popups or new tabs
- [ ] The communeworld.com domain whitelisted in the Cashfree dashboard (backend team, production)
- [ ] Sandbox test: link from the app → page → pay with a Cashfree test card → the app shows success
