import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function getServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Service configuration is missing.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

export function getAdminEmail() {
  return Deno.env.get("WITHDRAWAL_ADMIN_EMAIL") || "michealuzer@gmail.com";
}

export function formatUsd(value: number | string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function formatMethod(method: string) {
  if (method === "bank_transfer") return "Bank Transfer";
  if (method === "bitcoin") return "Bitcoin Wallet";
  return "Mobile Money";
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return { sent: false, reason: "RESEND_API_KEY is not configured." };

  const from = Deno.env.get("WITHDRAWAL_FROM_EMAIL") || "QuantumTrade <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { sent: false, reason: data?.message || "Email provider rejected the message." };
  }

  return { sent: true, id: data?.id };
}

export function renderDetails(details: Record<string, unknown>) {
  const rows = Object.entries(details || {})
    .map(([key, value]) => `<tr><td style="padding:6px 10px;color:#667085">${escapeHtml(key.replaceAll("_", " "))}</td><td style="padding:6px 10px;font-weight:700">${escapeHtml(String(value || ""))}</td></tr>`)
    .join("");
  return `<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:14px">${rows}</table>`;
}

export function escapeHtml(value: string) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[char] || char));
}
