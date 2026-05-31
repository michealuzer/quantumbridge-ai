import { corsHeaders, getServiceClient, jsonResponse } from "../_shared/withdrawal-email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!jwt) return jsonResponse({ error: "Missing authorization token" }, 401);

    const supabase = getServiceClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) return jsonResponse({ error: "Invalid user session" }, 401);

    const { error: settleError } = await supabase.rpc("qt_settle_wallet", { p_user_id: userData.user.id });
    if (settleError) return jsonResponse({ error: settleError.message }, 400);

    const [walletResult, investmentsResult, withdrawalsResult] = await Promise.all([
      supabase.from("qt_wallets").select("loaded_available_usd,yield_available_usd,updated_at").eq("user_id", userData.user.id).single(),
      supabase
        .from("qt_investments")
        .select("id,plan_id,principal_usd,daily_credit_usd,projected_return_usd,day_number,duration_days,status,mode,credited_days,matures_at,matured_at,created_at,qt_plans(name,slug,daily_return_percent)")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("qt_withdrawals")
        .select("id,amount_usd,method,status,created_at")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false }),
    ]);

    const error = walletResult.error || investmentsResult.error || withdrawalsResult.error;
    if (error) return jsonResponse({ error: error.message }, 400);

    const wallet = walletResult.data;
    return jsonResponse({
      wallet: {
        ...wallet,
        available_balance_usd: Number(wallet.loaded_available_usd || 0) + Number(wallet.yield_available_usd || 0),
      },
      investments: investmentsResult.data || [],
      withdrawals: withdrawalsResult.data || [],
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Could not load portfolio." }, 500);
  }
});
