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
    const amountUsd = Number(body.amount_usd || body.amountUsd || 0);
    const mode = String(body.mode || "standard").trim().toLowerCase();
    if (!slug) return jsonResponse({ error: "Choose a valid package." }, 400);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return jsonResponse({ error: "Enter an amount to invest." }, 400);
    if (!["standard", "compound"].includes(mode)) return jsonResponse({ error: "Choose Standard or Compounding." }, 400);

    const { data, error } = await supabase.rpc("qt_purchase_plan", {
      p_user_id: userData.user.id,
      p_plan_slug: slug,
      p_amount_usd: amountUsd,
      p_mode: mode,
    });
    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ ...data, message: "Your new position is active. Its first credit begins after 24 hours." });
  } catch (error) {
    return jsonResponse({ error: error.message || "Could not activate package." }, 500);
  }
});
