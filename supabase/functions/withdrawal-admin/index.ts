import { corsHeaders, escapeHtml, formatMethod, formatUsd, getAdminEmail, getServiceClient, jsonResponse, renderDetails, sendEmail } from "../_shared/withdrawal-email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    if (action === "mark_paid") {
      const withdrawalId = String(body.withdrawal_id || body.withdrawalId || "");
      const adminNote = String(body.admin_note || body.adminNote || "");
      if (!withdrawalId) return jsonResponse({ error: "Missing withdrawal ID." }, 400);

      const { data: withdrawal, error: lookupError } = await supabase
        .from("qt_withdrawals")
        .select("id,user_id,amount_usd,method,details,status,created_at")
        .eq("id", withdrawalId)
        .maybeSingle();

      if (lookupError || !withdrawal) return jsonResponse({ error: lookupError?.message || "Withdrawal not found." }, 404);

      const completedAt = new Date().toISOString();
      const { data: updated, error: updateError } = await supabase
        .from("qt_withdrawals")
        .update({
          status: "completed",
          completed_at: completedAt,
          completed_by: userData.user.id,
          admin_note: adminNote || null,
        })
        .eq("id", withdrawalId)
        .select("id,user_id,amount_usd,method,details,status,created_at,completed_at,admin_note")
        .single();

      if (updateError) return jsonResponse({ error: updateError.message }, 400);

      const { data: profile } = await supabase
        .from("qt_profiles")
        .select("email,display_name,investor_code")
        .eq("user_id", withdrawal.user_id)
        .maybeSingle();

      const investorEmail = profile?.email;
      let emailResult = { sent: false, reason: "Investor email not found." };
      if (investorEmail) {
        emailResult = await sendEmail({
          to: investorEmail,
          subject: `QuantumTrade payout completed - ${formatUsd(updated.amount_usd)}`,
          html: `
            <div style="font-family:Arial,sans-serif;color:#101828;line-height:1.5">
              <h2>Your payout has been completed</h2>
              <p>Hello ${escapeHtml(profile?.display_name || "Investor")},</p>
              <p>Your withdrawal request for <strong>${formatUsd(updated.amount_usd)}</strong> has been marked as paid.</p>
              <p><strong>Method:</strong> ${formatMethod(updated.method)}</p>
              <p><strong>Withdrawal ID:</strong> ${updated.id}</p>
              ${adminNote ? `<p><strong>Note:</strong> ${escapeHtml(adminNote)}</p>` : ""}
              <h3>Payout details</h3>
              ${renderDetails(updated.details as Record<string, unknown>)}
            </div>
          `,
        });
      }

      if (emailResult.sent) {
        await supabase
          .from("qt_withdrawals")
          .update({ investor_notified_at: new Date().toISOString() })
          .eq("id", updated.id);
      }

      return jsonResponse({ withdrawal: updated, email: emailResult });
    }

    const { data, error } = await supabase
      .from("qt_withdrawals")
      .select("id,user_id,amount_usd,method,details,status,created_at,completed_at,admin_email_sent_at,investor_notified_at,admin_note")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return jsonResponse({ error: error.message }, 400);

    const userIds = [...new Set((data || []).map((row) => row.user_id).filter(Boolean))];
    const { data: profiles } = userIds.length
      ? await supabase
        .from("qt_profiles")
        .select("user_id,email,display_name,investor_code")
        .in("user_id", userIds)
      : { data: [] };
    const profilesByUserId = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
    const withdrawals = (data || []).map((row) => ({
      ...row,
      profile: profilesByUserId.get(row.user_id) || null,
    }));

    return jsonResponse({ withdrawals });
  } catch (error) {
    return jsonResponse({ error: error.message || "Withdrawal admin action failed" }, 500);
  }
});
