# Pesapal API 3.0 Integration Notes

Source docs:
- API reference: https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/api-reference
- Authentication: https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/authentication
- Register IPN URL: https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/registeripnurl
- Get registered IPNs: https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/getregisteredipn
- Submit order request: https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/submitorderrequest
- Get transaction status: https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/gettransactionstatus
- Recurring payments: https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/recurringpayments
- Refund request: https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/refund-request
- Order cancellation: https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/order-cancellation-api

## Base URLs

Sandbox:
`https://cybqa.pesapal.com/pesapalv3`

Live:
`https://pay.pesapal.com/v3`

All requests and responses are JSON. Use `Accept: application/json` and `Content-Type: application/json`.

## Credentials

Pesapal uses a merchant `consumer_key` and `consumer_secret` to mint a short-lived bearer token.

Do not put these in browser code. They must live in a backend/serverless environment.

## Core Flow For QuantumBridge

1. User chooses a fund and amount in QuantumBridge.
2. Backend creates a local payment row with status `pending`.
3. Backend requests a Pesapal access token.
4. Backend registers or reuses an IPN URL and stores the returned `ipn_id`.
5. Backend submits an order request to Pesapal with:
   - merchant reference from our system
   - currency
   - amount
   - description
   - callback URL
   - cancellation URL
   - `notification_id` from IPN registration
   - billing address
6. Pesapal returns `order_tracking_id`, `merchant_reference`, and `redirect_url`.
7. Frontend redirects the user to `redirect_url`, or opens it in an iframe if we choose embedded checkout.
8. Pesapal redirects the customer back to our callback URL.
9. Pesapal also calls our IPN URL.
10. On callback or IPN, backend calls GetTransactionStatus using `orderTrackingId`.
11. Backend updates local payment row.
12. If status is `COMPLETED`, activate or increase the user's investment/funds.

## Authentication

Endpoint:
- Sandbox: `POST /api/Auth/RequestToken`
- Live: `POST /api/Auth/RequestToken`

Request body:
```json
{
  "consumer_key": "merchant_consumer_key",
  "consumer_secret": "merchant_consumer_secret"
}
```

Response includes:
- `token`
- `expiryDate`
- `status`
- `message`
- `error`

The token expires after about 5 minutes. Cache it server-side until close to expiry.

## IPN Registration

Endpoint:
- Sandbox: `POST /api/URLSetup/RegisterIPN`
- Live: `POST /api/URLSetup/RegisterIPN`

Auth:
`Authorization: Bearer <token>`

Request body:
```json
{
  "url": "https://your-domain.com/api/pesapal/ipn",
  "ipn_notification_type": "POST"
}
```

Response includes:
- `ipn_id`
- `url`
- `created_date`
- `ipn_status`
- `ipn_status_description`
- `status`

Notes:
- IPN URL must be publicly available.
- Pesapal says IP whitelisting is not feasible because their IP may change.
- `ipn_id` is required as `notification_id` when submitting an order.

## Get Registered IPNs

Endpoint:
- Sandbox: `GET /api/URLSetup/GetIpnList`
- Live: `GET /api/URLSetup/GetIpnList`

Auth:
`Authorization: Bearer <token>`

No payload. Returns registered IPN URLs and their `ipn_id`s.

Use this to avoid registering duplicate IPN URLs.

## Submit Order Request

Endpoint:
- Sandbox: `POST /api/Transactions/SubmitOrderRequest`
- Live: `POST /api/Transactions/SubmitOrderRequest`

Auth:
`Authorization: Bearer <token>`

Required request fields:
- `id`: our unique merchant reference, max 50 chars, only alphanumeric plus `-`, `_`, `.`, `:`
- `currency`: ISO currency code such as `KES`, `UGX`, `USD`
- `amount`: amount to process
- `description`: max 100 chars
- `callback_url`: where Pesapal redirects the user after payment
- `notification_id`: IPN ID from RegisterIPN
- `billing_address`: customer info

Optional request fields:
- `redirect_mode`: `TOP_WINDOW` or `PARENT_WINDOW`
- `cancellation_url`
- `branch`
- `account_number` for recurring/subscription use

Minimum sample:
```json
{
  "id": "QB-ORDER-123",
  "currency": "KES",
  "amount": 100.00,
  "description": "QuantumBridge investment funding",
  "callback_url": "https://your-domain.com/pesapal/callback",
  "cancellation_url": "https://your-domain.com/pesapal/cancelled",
  "notification_id": "ipn-guid-from-pesapal",
  "billing_address": {
    "email_address": "investor@example.com",
    "phone_number": "0723000000",
    "country_code": "KE",
    "first_name": "Investor",
    "last_name": "User"
  }
}
```

Response includes:
- `order_tracking_id`
- `merchant_reference`
- `redirect_url`
- `error`
- `status`

If status is `200`, redirect the customer to `redirect_url`.

## Callback And IPN

Pesapal callback appends query params to the callback URL:
- `OrderTrackingId`
- `OrderMerchantReference`
- `OrderNotificationType`, usually `CALLBACKURL`

IPN call includes:
- `OrderTrackingId`
- `OrderMerchantReference`
- `OrderNotificationType`, usually `IPNCHANGE`

Important:
- Callback should show the user a payment result page.
- IPN should respond with JSON after processing.
- Neither callback nor IPN contains the full trusted payment status. Always call GetTransactionStatus.

IPN response example:
```json
{
  "orderNotificationType": "IPNCHANGE",
  "orderTrackingId": "tracking-guid",
  "orderMerchantReference": "QB-ORDER-123",
  "status": 200
}
```

## Get Transaction Status

Endpoint:
- Sandbox: `GET /api/Transactions/GetTransactionStatus?orderTrackingId=<id>`
- Live: `GET /api/Transactions/GetTransactionStatus?orderTrackingId=<id>`

Auth:
`Authorization: Bearer <token>`

Response fields to store:
- `payment_method`
- `amount`
- `created_date`
- `confirmation_code`
- `payment_status_description`
- `description`
- `message`
- `payment_account`
- `call_back_url`
- `status_code`
- `merchant_reference`
- `currency`
- `status`
- `error`

Status codes:
- `0`: INVALID
- `1`: COMPLETED
- `2`: FAILED
- `3`: REVERSED

Only activate investor funds when `status_code` is `1` or `payment_status_description` is `COMPLETED`.

## Recurring Payments

Recurring payments are enabled through SubmitOrderRequest.

Basic recurring trigger:
- include `account_number`

Optional preset subscription:
```json
{
  "account_number": "QB-INVESTOR-123",
  "subscription_details": {
    "start_date": "24-01-2026",
    "end_date": "31-12-2026",
    "frequency": "MONTHLY"
  }
}
```

Supported frequency values:
- `DAILY`
- `WEEKLY`
- `MONTHLY`
- `YEARLY`

Pesapal still requires the customer to accept recurring enrollment in the iframe.

Recurring IPN:
- `OrderNotificationType` is `RECURRING`
- GetTransactionStatus response may include `subscription_transaction_info`.

## Refunds

Endpoint:
- Sandbox: `POST /api/Transactions/RefundRequest`
- Live: `POST /api/Transactions/RefundRequest`

Auth:
`Authorization: Bearer <token>`

Request:
```json
{
  "confirmation_code": "AA11BB22",
  "amount": "100.00",
  "username": "Admin User",
  "remarks": "Reason for refund"
}
```

Rules:
- Requires merchant approval.
- Cannot refund more than original amount.
- Only `COMPLETED` payments can be refunded.
- Card payments can be partial or full.
- Mobile money payments can only be fully refunded.
- Multiple refunds are not allowed.
- Store `confirmation_code` from GetTransactionStatus.

## Order Cancellation

Endpoint:
- Sandbox: `POST /api/Transactions/CancelOrder`
- Live: `POST /api/Transactions/CancelOrder`

Auth:
`Authorization: Bearer <token>`

Request:
```json
{
  "order_tracking_id": "tracking-guid"
}
```

Rules:
- Only failed or pending payments can be cancelled.
- Cancellation can only be submitted once.
- Completed payments cannot be cancelled.

## Backend Data We Should Add

Added tables:
- `qb_payments`
- `qb_payment_events`

`qb_payments` fields:
- `id`
- `user_id`
- `investment_id`
- `merchant_reference`
- `order_tracking_id`
- `currency`
- `amount`
- `description`
- `pesapal_redirect_url`
- `payment_method`
- `payment_account`
- `confirmation_code`
- `status_code`
- `payment_status_description`
- `raw_status_response`
- `created_at`
- `updated_at`

Edge/serverless endpoints:
- `POST /functions/v1/pesapal-create-order`
- `GET /functions/v1/pesapal-callback`
- `POST /functions/v1/pesapal-ipn`
- `GET /functions/v1/pesapal-status?orderTrackingId=...`
- optional `POST /payments/pesapal/cancel`
- optional `POST /payments/pesapal/refund`

## Supabase Edge Function Secrets

Required secrets:
- `PESAPAL_ENVIRONMENT`
- `PESAPAL_BASE_URL`
- `PESAPAL_CONSUMER_KEY`
- `PESAPAL_CONSUMER_SECRET`
- `PESAPAL_CALLBACK_URL`
- `PESAPAL_IPN_URL`
- `PESAPAL_CANCELLATION_URL`
- `PUBLIC_APP_URL`

The consumer key and consumer secret must only be stored as Supabase Edge Function secrets. Do not put them in `auth-config.js`, `app.js`, or any browser-delivered file.

## Security Rules

- Never expose `consumer_key` or `consumer_secret` in browser JavaScript.
- Only create payment orders on the backend for authenticated users.
- Validate amount and selected fund server-side.
- Ensure `merchant_reference` is unique and belongs to the logged-in user.
- Treat callback/IPN data as a signal only, not final truth.
- Always call GetTransactionStatus before crediting funds.
- Store raw Pesapal responses for audit/debugging.
- Make IPN endpoint public but validate against stored `merchant_reference` and `order_tracking_id`.
