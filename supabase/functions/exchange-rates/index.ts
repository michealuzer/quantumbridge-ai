import { corsHeaders, jsonResponse } from "../_shared/pesapal.ts";
import { getExchangeRateQuote } from "../_shared/exchange-rates.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  return jsonResponse(await getExchangeRateQuote());
});
