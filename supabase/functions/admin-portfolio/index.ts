import { corsHeaders, getAdminEmail, getServiceClient, jsonResponse } from "../_shared/withdrawal-email.ts";

type PlanRow = {
  id: string;
  daily_return_percent: number | string;
  duration_days: number | string;
};

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

    const adminEmail = getAdminEmail().toLowerCase();
    if (String(userData.user.email || "").toLowerCase() !== adminEmail) {
      return jsonResponse({ error: "Admin access required." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "list");

    if (action === "list") return await listPortfolio(supabase);
    if (action === "create_investment") return await createInvestment(supabase, body);
    if (action === "update_investment") return await updateInvestment(supabase, body);
    if (action === "create_project") return await createProject(supabase, body);
    if (action === "update_project") return await updateProject(supabase, body);

    return jsonResponse({ error: "Unknown portfolio admin action." }, 400);
  } catch (error) {
    return jsonResponse({ error: error.message || "Portfolio admin action failed" }, 500);
  }
});

async function listPortfolio(supabase: ReturnType<typeof getServiceClient>) {
  const [profilesResult, plansResult, investmentsResult, projectsResult] = await Promise.all([
    supabase
      .from("qt_profiles")
      .select("user_id,email,display_name,investor_code,created_at")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("qt_plans")
      .select("id,slug,name,daily_return_percent,duration_days,min_deposit_usd,sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("qt_investments")
      .select("id,user_id,plan_id,principal_usd,daily_credit_usd,projected_return_usd,day_number,duration_days,status,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("qt_projects")
      .select("id,user_id,symbol,side,risk,result_percent,status,placed_at,created_at")
      .order("placed_at", { ascending: false })
      .limit(300),
  ]);

  const error = profilesResult.error || plansResult.error || investmentsResult.error || projectsResult.error;
  if (error) return jsonResponse({ error: error.message }, 400);

  const profiles = profilesResult.data || [];
  const plans = plansResult.data || [];
  const profilesByUserId = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));

  const investments = (investmentsResult.data || []).map((investment) => ({
    ...investment,
    profile: profilesByUserId.get(investment.user_id) || null,
    plan: plansById.get(investment.plan_id) || null,
  }));

  const projects = (projectsResult.data || []).map((project) => ({
    ...project,
    profile: profilesByUserId.get(project.user_id) || null,
  }));

  return jsonResponse({ profiles, plans, investments, projects });
}

async function createInvestment(supabase: ReturnType<typeof getServiceClient>, body: Record<string, unknown>) {
  const userId = String(body.user_id || body.userId || "");
  const planId = String(body.plan_id || body.planId || "");
  const principal = Number(body.principal_usd || body.principalUsd || 0);
  const status = normalizeInvestmentStatus(body.status);

  if (!userId || !planId) return jsonResponse({ error: "Investor and plan are required." }, 400);
  if (!Number.isFinite(principal) || principal <= 0) return jsonResponse({ error: "Principal must be greater than zero." }, 400);

  const { data: plan, error: planError } = await supabase
    .from("qt_plans")
    .select("id,daily_return_percent,duration_days")
    .eq("id", planId)
    .maybeSingle();
  if (planError || !plan) return jsonResponse({ error: planError?.message || "Plan not found." }, 404);

  const computed = computeInvestmentNumbers(principal, plan);
  const { data, error } = await supabase
    .from("qt_investments")
    .insert({
      user_id: userId,
      plan_id: planId,
      principal_usd: principal,
      daily_credit_usd: computed.dailyCredit,
      projected_return_usd: computed.projectedReturn,
      duration_days: computed.durationDays,
      day_number: 1,
      status,
    })
    .select("id,user_id,plan_id,principal_usd,daily_credit_usd,projected_return_usd,day_number,duration_days,status,created_at,updated_at")
    .single();

  if (error) return jsonResponse({ error: error.message }, 400);
  return jsonResponse({ investment: data });
}

async function updateInvestment(supabase: ReturnType<typeof getServiceClient>, body: Record<string, unknown>) {
  const investmentId = String(body.investment_id || body.investmentId || body.id || "");
  if (!investmentId) return jsonResponse({ error: "Missing investment ID." }, 400);

  const { data: existing, error: existingError } = await supabase
    .from("qt_investments")
    .select("id,plan_id,principal_usd")
    .eq("id", investmentId)
    .maybeSingle();
  if (existingError || !existing) return jsonResponse({ error: existingError?.message || "Investment not found." }, 404);

  const nextPlanId = String(body.plan_id || body.planId || existing.plan_id || "");
  const principal = body.principal_usd || body.principalUsd
    ? Number(body.principal_usd || body.principalUsd)
    : Number(existing.principal_usd || 0);

  if (!Number.isFinite(principal) || principal <= 0) return jsonResponse({ error: "Principal must be greater than zero." }, 400);

  const { data: plan, error: planError } = await supabase
    .from("qt_plans")
    .select("id,daily_return_percent,duration_days")
    .eq("id", nextPlanId)
    .maybeSingle();
  if (planError || !plan) return jsonResponse({ error: planError?.message || "Plan not found." }, 404);

  const computed = computeInvestmentNumbers(principal, plan);
  const updatePayload: Record<string, unknown> = {
    plan_id: nextPlanId,
    principal_usd: principal,
    daily_credit_usd: computed.dailyCredit,
    projected_return_usd: computed.projectedReturn,
    duration_days: computed.durationDays,
    updated_at: new Date().toISOString(),
  };

  if (body.day_number || body.dayNumber) {
    updatePayload.day_number = Math.max(1, Number(body.day_number || body.dayNumber));
  }
  if (body.status) updatePayload.status = normalizeInvestmentStatus(body.status);

  const { data, error } = await supabase
    .from("qt_investments")
    .update(updatePayload)
    .eq("id", investmentId)
    .select("id,user_id,plan_id,principal_usd,daily_credit_usd,projected_return_usd,day_number,duration_days,status,created_at,updated_at")
    .single();

  if (error) return jsonResponse({ error: error.message }, 400);
  return jsonResponse({ investment: data });
}

async function createProject(supabase: ReturnType<typeof getServiceClient>, body: Record<string, unknown>) {
  const userId = String(body.user_id || body.userId || "");
  const symbol = String(body.symbol || "").trim().slice(0, 120);
  if (!userId || !symbol) return jsonResponse({ error: "Investor and project name are required." }, 400);

  const { data, error } = await supabase
    .from("qt_projects")
    .insert({
      user_id: userId,
      symbol,
      side: String(body.side || "funded").trim().slice(0, 40),
      risk: String(body.risk || "secured").trim().slice(0, 40),
      result_percent: Number(body.result_percent || body.resultPercent || 0),
      status: String(body.status || "active").trim().slice(0, 40),
      placed_at: body.placed_at ? new Date(String(body.placed_at)).toISOString() : new Date().toISOString(),
    })
    .select("id,user_id,symbol,side,risk,result_percent,status,placed_at,created_at")
    .single();

  if (error) return jsonResponse({ error: error.message }, 400);
  return jsonResponse({ project: data });
}

async function updateProject(supabase: ReturnType<typeof getServiceClient>, body: Record<string, unknown>) {
  const projectId = String(body.project_id || body.projectId || body.id || "");
  if (!projectId) return jsonResponse({ error: "Missing project ID." }, 400);

  const updatePayload: Record<string, unknown> = {};
  if (body.symbol) updatePayload.symbol = String(body.symbol).trim().slice(0, 120);
  if (body.side) updatePayload.side = String(body.side).trim().slice(0, 40);
  if (body.risk) updatePayload.risk = String(body.risk).trim().slice(0, 40);
  if (body.status) updatePayload.status = String(body.status).trim().slice(0, 40);
  if (body.result_percent !== undefined || body.resultPercent !== undefined) {
    updatePayload.result_percent = Number(body.result_percent || body.resultPercent || 0);
  }

  const { data, error } = await supabase
    .from("qt_projects")
    .update(updatePayload)
    .eq("id", projectId)
    .select("id,user_id,symbol,side,risk,result_percent,status,placed_at,created_at")
    .single();

  if (error) return jsonResponse({ error: error.message }, 400);
  return jsonResponse({ project: data });
}

function computeInvestmentNumbers(principal: number, plan: PlanRow) {
  const dailyPercent = Number(plan.daily_return_percent || 0);
  const durationDays = Number(plan.duration_days || 0);
  const dailyCredit = Number((principal * (dailyPercent / 100)).toFixed(2));
  const projectedReturn = Number((dailyCredit * durationDays).toFixed(2));
  return { dailyCredit, durationDays, projectedReturn };
}

function normalizeInvestmentStatus(value: unknown) {
  const status = String(value || "active").toLowerCase();
  return ["active", "paused", "completed", "withdrawn"].includes(status) ? status : "active";
}
