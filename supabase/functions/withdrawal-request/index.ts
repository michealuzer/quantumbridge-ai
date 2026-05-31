import { corsHeaders, formatMethod, formatUsd, getAdminEmail, getServiceClient, jsonResponse, renderDetails, sendEmail } from "../_shared/withdrawal-email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return jsonResponse({ error: "Missing authorization token" }, 401);

    const supabase = getServiceClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) return jsonResponse({ error: "Invalid user session" }, 401);

    const body = await req.json().catch(() => ({}));
    const amountUsd = Number(body.amount_usd || body.amountUsd || 0);
    const method = String(body.method || "");
    const details = typeof body.details === "object" && body.details ? body.details : {};

    if (!Number.isFinite(amountUsd) || amountUsd < 5) {
      return jsonResponse({ error: "Minimum withdrawal amount is $5.00 USD." }, 400);
    }

    if (!["mobile_money", "bank_transfer", "bitcoin"].includes(method)) {
      return jsonResponse({ error: "Choose a valid payout method." }, 400);
    }

    const { data: profile } = await supabase
      .from("qt_profiles")
      .select("email,display_name,investor_code")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    const { data: withdrawal, error: insertError } = await supabase.rpc("qt_create_withdrawal", {
      p_user_id: userData.user.id,
      p_amount_usd: amountUsd,
      p_method: method,
      p_details: details,
    });

    if (insertError) return jsonResponse({ error: insertError.message }, 400);

    const adminEmail = getAdminEmail();
    const emailResult = await sendEmail({
      to: adminEmail,
      subject: `QuantumTrade withdrawal request - ${formatUsd(amountUsd)}`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#101828;line-height:1.5">
          <h2>New withdrawal request</h2>
          <p><strong>Amount:</strong> ${formatUsd(amountUsd)}</p>
          <p><strong>Method:</strong> ${formatMethod(method)}</p>
          <p><strong>Investor:</strong> ${profile?.display_name || "Investor"} (${profile?.email || userData.user.email || "No email"})</p>
          <p><strong>Investor code:</strong> ${profile?.investor_code || "N/A"}</p>
          <p><strong>Withdrawal ID:</strong> ${withdrawal.id}</p>
          <h3>Payout details</h3>
          ${renderDetails(details as Record<string, unknown>)}
          <p style="margin-top:20px;color:#667085">After you make the payout, open QuantumTrade as the admin account and mark this request paid.</p>
        </div>
      `,
    });

    if (emailResult.sent) {
      await supabase
        .from("qt_withdrawals")
        .update({ admin_email_sent_at: new Date().toISOString() })
        .eq("id", withdrawal.id);
    }

    return jsonResponse({ withdrawal, email: emailResult });
  } catch (error) {
    return jsonResponse({ error: error.message || "Withdrawal request failed" }, 500);
  }
});
