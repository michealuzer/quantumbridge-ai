import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { fallbackToUsdAmount } from "./exchange-rates.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export type PesapalConfig = {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  callbackUrl: string;
  cancellationUrl: string;
  ipnId?: string;
  ipnUrl?: string;
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function getConfig(): PesapalConfig {
  const environment = Deno.env.get("PESAPAL_ENVIRONMENT") || "sandbox";
  const baseUrl = Deno.env.get("PESAPAL_BASE_URL") ||
    (environment === "live" ? "https://pay.pesapal.com/v3" : "https://cybqa.pesapal.com/pesapalv3");
  const consumerKey = Deno.env.get("PESAPAL_CONSUMER_KEY") || "";
  const consumerSecret = Deno.env.get("PESAPAL_CONSUMER_SECRET") || "";

  if (!consumerKey || !consumerSecret) {
    throw new Error("Pesapal credentials are not configured.");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  return {
    baseUrl,
    consumerKey,
    consumerSecret,
    callbackUrl: Deno.env.get("PESAPAL_CALLBACK_URL") || `${supabaseUrl}/functions/v1/pesapal-callback`,
    cancellationUrl: Deno.env.get("PESAPAL_CANCELLATION_URL") || Deno.env.get("PUBLIC_APP_URL") || "https://quantumbridge-ai.netlify.app/#/dashboard",
    ipnId: Deno.env.get("PESAPAL_IPN_ID") || undefined,
    ipnUrl: Deno.env.get("PESAPAL_IPN_URL") || `${supabaseUrl}/functions/v1/pesapal-ipn`,
  };
}

export function getServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service configuration is missing.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function getPesapalToken(config: PesapalConfig) {
  const response = await fetch(`${config.baseUrl}/api/Auth/RequestToken`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      consumer_key: config.consumerKey,
      consumer_secret: config.consumerSecret,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.token) {
    throw new Error(data?.message || data?.error?.message || "Failed to authenticate with Pesapal.");
  }

  return data.token as string;
}

export async function getOrRegisterIpn(config: PesapalConfig, token: string) {
  if (config.ipnId) return config.ipnId;

  const response = await fetch(`${config.baseUrl}/api/URLSetup/RegisterIPN`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      url: config.ipnUrl,
      ipn_notification_type: "POST",
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.ipn_id) {
    throw new Error(data?.message || data?.error?.message || "Failed to register Pesapal IPN.");
  }

  return data.ipn_id as string;
}

export async function getTransactionStatus(config: PesapalConfig, token: string, orderTrackingId: string) {
  const url = new URL(`${config.baseUrl}/api/Transactions/GetTransactionStatus`);
  url.searchParams.set("orderTrackingId", orderTrackingId);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || data?.error?.message || "Failed to fetch Pesapal transaction status.");
  }

  return data;
}

export async function syncPaymentStatus(orderTrackingId: string, eventType: string, payload: Record<string, unknown>) {
  const config = getConfig();
  const token = await getPesapalToken(config);
  const status = await getTransactionStatus(config, token, orderTrackingId);
  const supabase = getServiceClient();

  const { data: payment } = await supabase
    .from("qb_payments")
    .select("id,user_id,plan_id,currency,amount,amount_usd,status_code,payment_status_description,balance_credited_at")
    .eq("order_tracking_id", orderTrackingId)
    .maybeSingle();

  const updatePayload = {
    payment_method: status.payment_method ?? null,
    payment_account: status.payment_account ?? null,
    confirmation_code: status.confirmation_code ?? null,
    status_code: typeof status.status_code === "number" ? status.status_code : Number(status.status_code ?? 0),
    payment_status_description: status.payment_status_description ?? "UNKNOWN",
    raw_status_response: status,
    updated_at: new Date().toISOString(),
  };

  if (payment?.id) {
    await supabase.from("qb_payments").update(updatePayload).eq("id", payment.id);
    await creditInvestmentBalance(supabase, payment, status);
  }

  await supabase.from("qb_payment_events").insert({
    payment_id: payment?.id ?? null,
    merchant_reference: String(payload.OrderMerchantReference || payload.orderMerchantReference || payload.merchant_reference || ""),
    order_tracking_id: orderTrackingId,
    event_type: eventType,
    payload: { ...payload, status },
  });

  return status;
}

export async function creditInvestmentBalance(
  supabase: ReturnType<typeof getServiceClient>,
  payment: {
    id: string;
    user_id: string;
    plan_id: string | null;
    currency?: string | null;
    amount: number | string;
    amount_usd?: number | string | null;
    status_code: number | string | null;
    payment_status_description: string | null;
    balance_credited_at?: string | null;
  },
  status: Record<string, unknown>,
) {
  const statusCode = typeof status.status_code === "number" ? status.status_code : Number(status.status_code ?? 0);
  const description = String(status.payment_status_description || "").toUpperCase();
  const wasCompleted = Number(payment.status_code || 0) === 1 ||
    String(payment.payment_status_description || "").toUpperCase() === "COMPLETED";
  const isCompleted = statusCode === 1 || description === "COMPLETED";

  if (!isCompleted || wasCompleted || payment.balance_credited_at) return;

  const amount = Number(payment.amount_usd || fallbackToUsdAmount(Number(payment.amount || 0), String(payment.currency || "USD")));
  if (!Number.isFinite(amount) || amount <= 0) return;

  const { data: creditLock } = await supabase
    .from("qb_payments")
    .update({ balance_credited_at: new Date().toISOString() })
    .eq("id", payment.id)
    .is("balance_credited_at", null)
    .select("id")
    .maybeSingle();

  if (!creditLock?.id) return;

  const { error: walletError } = await supabase.rpc("qt_credit_loaded_wallet", {
    p_user_id: payment.user_id,
    p_amount_usd: amount,
    p_reference_id: payment.id,
  });
  if (walletError) throw new Error(walletError.message);
  await awardReferralCommissions(supabase, payment.id, payment.user_id, amount);
}

async function awardReferralCommissions(
  supabase: ReturnType<typeof getServiceClient>,
  paymentId: string,
  sourceUserId: string,
  amountUsd: number,
) {
  const rates = [5, 2, 1];
  let nextSourceUserId: string | null = sourceUserId;

  for (let level = 1; level <= rates.length; level += 1) {
    const { data: sourceProfile } = await supabase
      .from("qt_profiles")
      .select("referrer_user_id")
      .eq("user_id", nextSourceUserId)
      .maybeSingle();

    const beneficiaryUserId = sourceProfile?.referrer_user_id;
    if (!beneficiaryUserId) break;

    const ratePercent = rates[level - 1];
    const commissionAmount = Number(((amountUsd * ratePercent) / 100).toFixed(2));

    await supabase
      .from("qt_referral_commissions")
      .upsert({
        payment_id: paymentId,
        source_user_id: sourceUserId,
        beneficiary_user_id: beneficiaryUserId,
        level,
        rate_percent: ratePercent,
        amount_usd: commissionAmount,
        status: "earned",
      }, { onConflict: "payment_id,beneficiary_user_id,level", ignoreDuplicates: true });

    nextSourceUserId = beneficiaryUserId;
  }
}
