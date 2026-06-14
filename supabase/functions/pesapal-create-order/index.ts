import { corsHeaders, getConfig, getOrRegisterIpn, getPesapalToken, getServiceClient, jsonResponse } from "../_shared/pesapal.ts";
import { getExchangeRateQuote, normalizeCurrency } from "../_shared/exchange-rates.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return jsonResponse({ error: "Missing authorization token" }, 401);

    const supabase = getServiceClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) return jsonResponse({ error: "Invalid user session" }, 401);

    const body = await req.json();
    const amount = Number(body.amount);
    const currency = normalizeCurrency(String(body.currency || "KES"));
    const quote = await getExchangeRateQuote();
    const exchangeRate = quote.rates[currency];
    const amountUsd = amount / exchangeRate;

    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonResponse({ error: "Amount must be greater than zero" }, 400);
    }

    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      return jsonResponse({ error: "Unsupported currency selected." }, 400);
    }

    const minDepositUsd = 10;
    if (amountUsd < minDepositUsd) {
      return jsonResponse({ error: `Minimum account load is ${formatUsd(minDepositUsd)} or ${formatLocalAmount(minDepositUsd * exchangeRate, currency)}` }, 400);
    }

    const config = getConfig();
    const token = await getPesapalToken(config);
    const notificationId = await getOrRegisterIpn(config, token);
    const merchantReference = `QB-${crypto.randomUUID()}`;
    const description = "QuantumTrade account load";
    const billingAddress = body.billing_address || body.billingAddress || {};
    const preferredPaymentMethod = String(body.preferred_payment_method || body.preferredPaymentMethod || "");

    const orderPayload = {
      id: merchantReference,
      currency,
      amount,
      description,
      callback_url: config.callbackUrl,
      cancellation_url: config.cancellationUrl,
      notification_id: notificationId,
      billing_address: {
        email_address: billingAddress.email_address || userData.user.email,
        phone_number: billingAddress.phone_number || "",
        country_code: billingAddress.country_code || "KE",
        first_name: billingAddress.first_name || "QuantumBridge",
        last_name: billingAddress.last_name || "Investor",
      },
      account_number: phoneSafe(billingAddress.phone_number || userData.user.id),
    };

    const response = await fetch(`${config.baseUrl}/api/Transactions/SubmitOrderRequest`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(orderPayload),
    });

    const order = await response.json();
    if (!response.ok || !order.redirect_url) {
      console.error("Pesapal order creation failed", order);
      return jsonResponse({ error: order?.message || order?.error?.message || "Pesapal order creation failed", details: order }, 502);
    }

    const { error: paymentError } = await supabase.from("qb_payments").insert({
      user_id: userData.user.id,
      plan_id: null,
      merchant_reference: merchantReference,
      order_tracking_id: order.order_tracking_id,
      currency,
      amount,
      amount_usd: amountUsd,
      exchange_rate_usd: exchangeRate,
      exchange_rate_source: quote.source,
      exchange_rate_updated_at: quote.sourceUpdatedAt,
      description,
      pesapal_redirect_url: order.redirect_url,
      preferred_payment_method: preferredPaymentMethod,
      billing_address: orderPayload.billing_address,
      raw_order_response: order,
    });
    if (paymentError) {
      console.error("Payment record insert failed", paymentError);
      return jsonResponse({ error: "Checkout was created but the payment record could not be saved. Please contact support before retrying.", details: paymentError }, 500);
    }

    return jsonResponse({
      merchant_reference: merchantReference,
      order_tracking_id: order.order_tracking_id,
      redirect_url: order.redirect_url,
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Unexpected Pesapal create-order error" }, 500);
  }
});

function phoneSafe(value: unknown) {
  return String(value || "").replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 50);
}

function formatUsd(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function formatLocalAmount(amount: number, currency: string) {
  return `${currency} ${Math.ceil(amount).toLocaleString("en-US")}`;
}
