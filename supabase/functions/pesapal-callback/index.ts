import { syncPaymentStatus } from "../_shared/pesapal.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const orderTrackingId = url.searchParams.get("OrderTrackingId") || url.searchParams.get("orderTrackingId");

  if (orderTrackingId) {
    await syncPaymentStatus(orderTrackingId, "CALLBACKURL", Object.fromEntries(url.searchParams.entries()));
  }

  const appUrl = Deno.env.get("PUBLIC_APP_URL") || "https://quantumbridge-ai.netlify.app";
  const dashboardUrl = new URL(appUrl);
  dashboardUrl.hash = orderTrackingId ? `/dashboard?payment=${encodeURIComponent(orderTrackingId)}` : "/dashboard";
  return Response.redirect(dashboardUrl.toString(), 302);
});
