import { corsHeaders, jsonResponse, syncPaymentStatus } from "../_shared/pesapal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let payload: Record<string, unknown> = {};
    if (req.method === "POST") {
      payload = await req.json().catch(() => ({}));
    } else {
      payload = Object.fromEntries(new URL(req.url).searchParams.entries());
    }

    const orderTrackingId = String(payload.OrderTrackingId || payload.orderTrackingId || payload.order_tracking_id || "");
    if (!orderTrackingId) return jsonResponse({ status: 500, error: "Missing OrderTrackingId" }, 400);

    await syncPaymentStatus(orderTrackingId, "IPNCHANGE", payload);

    return jsonResponse({
      orderNotificationType: payload.OrderNotificationType || payload.orderNotificationType || "IPNCHANGE",
      orderTrackingId,
      orderMerchantReference: payload.OrderMerchantReference || payload.orderMerchantReference || "",
      status: 200,
    });
  } catch (error) {
    return jsonResponse({ status: 500, error: error.message || "Pesapal IPN error" }, 500);
  }
});
