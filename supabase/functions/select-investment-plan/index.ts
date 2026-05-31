import { calculateCarriedYield, calculatePlanValues } from "../_shared/investment.ts";
import { corsHeaders, getServiceClient, jsonResponse } from "../_shared/withdrawal-email.ts";

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

    const body = await req.json().catch(() => ({}));
    const slug = String(body.plan_slug || body.planSlug || "").trim();
    if (!slug) return jsonResponse({ error: "Choose a valid package." }, 400);

    const [{ data: investment, error: investmentError }, { data: plan, error: planError }] = await Promise.all([
      supabase
        .from("qt_investments")
        .select("id,plan_id,principal_usd,carried_yield_usd,daily_credit_usd,duration_days,created_at")
        .eq("user_id", userData.user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("qt_plans")
        .select("id,slug,name,min_deposit_usd,max_deposit_usd,daily_return_percent,duration_days")
        .eq("slug", slug)
        .maybeSingle(),
    ]);

    if (investmentError || !investment) return jsonResponse({ error: investmentError?.message || "Load your account before choosing a package." }, 400);
    if (planError || !plan) return jsonResponse({ error: planError?.message || "Package not found." }, 404);

    const principal = Number(investment.principal_usd || 0);
    const minimum = Number(plan.min_deposit_usd || 0);
    const maximum = plan.max_deposit_usd === null ? null : Number(plan.max_deposit_usd);

    if (principal < minimum) {
      return jsonResponse({ error: `Add $${(minimum - principal).toFixed(2)} more to unlock ${plan.name}.` }, 400);
    }
    if (maximum !== null && principal > maximum) {
      return jsonResponse({ error: `${plan.name} supports balances up to $${maximum.toFixed(2)}. Choose a package for your current balance.` }, 400);
    }
    if (investment.plan_id === plan.id) return jsonResponse({ investment, unchanged: true });

    const computed = calculatePlanValues(principal, plan);
    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("qt_investments")
      .update({
        plan_id: plan.id,
        carried_yield_usd: calculateCarriedYield(investment),
        daily_credit_usd: computed.dailyCredit,
        projected_return_usd: computed.projectedReturn,
        duration_days: computed.durationDays,
        day_number: 1,
        created_at: now,
        updated_at: now,
      })
      .eq("id", investment.id)
      .eq("user_id", userData.user.id)
      .select("id,plan_id,principal_usd,carried_yield_usd,daily_credit_usd,projected_return_usd,duration_days,day_number,created_at")
      .single();

    if (updateError) return jsonResponse({ error: updateError.message }, 400);
    return jsonResponse({ investment: updated, message: `${plan.name} is now active. Your next credit begins after 24 hours.` });
  } catch (error) {
    return jsonResponse({ error: error.message || "Could not activate package." }, 500);
  }
});
