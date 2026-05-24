import { corsHeaders, creditInvestmentBalance, getConfig, getPesapalToken, getServiceClient, getTransactionStatus, jsonResponse } from "../_shared/pesapal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return jsonResponse({ error: "Missing authorization token" }, 401);

    const url = new URL(req.url);
    const orderTrackingId = url.searchParams.get("orderTrackingId");
    if (!orderTrackingId) return jsonResponse({ error: "Missing orderTrackingId" }, 400);

    const supabase = getServiceClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) return jsonResponse({ error: "Invalid user session" }, 401);

    const { data: payment } = await supabase
      .from("qb_payments")
      .select("id,user_id,plan_id,currency,amount,amount_usd,status_code,payment_status_description,balance_credited_at")
      .eq("order_tracking_id", orderTrackingId)
      .maybeSingle();

    if (!payment || payment.user_id !== userData.user.id) {
      return jsonResponse({ error: "Payment was not found" }, 404);
    }

    const config = getConfig();
    const token = await getPesapalToken(config);
    const status = await getTransactionStatus(config, token, orderTrackingId);

    await supabase.from("qb_payments").update({
      payment_method: status.payment_method ?? null,
      payment_account: status.payment_account ?? null,
      confirmation_code: status.confirmation_code ?? null,
      status_code: typeof status.status_code === "number" ? status.status_code : Number(status.status_code ?? 0),
      payment_status_description: status.payment_status_description ?? "UNKNOWN",
      raw_status_response: status,
      updated_at: new Date().toISOString(),
    }).eq("id", payment.id);

    await creditInvestmentBalance(supabase, payment, status);

    return jsonResponse({ status });
  } catch (error) {
    return jsonResponse({ error: error.message || "Pesapal status error" }, 500);
  }
});
