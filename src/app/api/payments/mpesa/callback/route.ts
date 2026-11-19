import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

type CallbackItem = { Name?: string; Value?: string | number };

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ResultCode: 1, ResultDesc: "Invalid JSON callback." },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null || !("Body" in body)) {
    return Response.json({ ResultCode: 1, ResultDesc: "Invalid callback." }, { status: 400 });
  }
  const stkCallback =
    typeof body.Body === "object" && body.Body !== null && "stkCallback" in body.Body
      ? body.Body.stkCallback
      : null;
  if (typeof stkCallback !== "object" || stkCallback === null) {
    return Response.json({ ResultCode: 1, ResultDesc: "Invalid STK callback." }, { status: 400 });
  }

  const callback = stkCallback as Record<string, unknown>;
  const checkoutRequestId =
    typeof callback.CheckoutRequestID === "string" ? callback.CheckoutRequestID : null;
  const resultCode = typeof callback.ResultCode === "number" ? callback.ResultCode : null;
  const resultDesc = typeof callback.ResultDesc === "string" ? callback.ResultDesc : "Unknown M-Pesa result";
  if (!checkoutRequestId || resultCode === null) {
    return Response.json({ ResultCode: 1, ResultDesc: "Incomplete callback." }, { status: 400 });
  }

  const metadata =
    typeof callback.CallbackMetadata === "object" && callback.CallbackMetadata !== null &&
    "Item" in callback.CallbackMetadata && Array.isArray(callback.CallbackMetadata.Item)
      ? callback.CallbackMetadata.Item as CallbackItem[]
      : [];
  const getMetadata = (name: string) =>
    metadata.find((item) => item.Name === name)?.Value;
  const receipt = getMetadata("MpesaReceiptNumber");
  const paidAmount = getMetadata("Amount");
  const phone = getMetadata("PhoneNumber");

  try {
    const supabase = createServiceClient();
    const { data: payment, error } = await supabase
      .from("custom_trip_payments")
      .select("id,amount,currency_code,status,provider")
      .eq("order_tracking_id", checkoutRequestId)
      .maybeSingle();
    if (error || !payment) {
      console.error("[payments.daraja.callback.lookup]", error?.message ?? "Payment not found");
      return Response.json({ ResultCode: 1, ResultDesc: "Payment not found." }, { status: 404 });
    }

    if (resultCode === 0) {
      if (
        paidAmount !== undefined &&
        Math.round(Number(paidAmount) * 100) !== Math.round(Number(payment.amount) * 100)
      ) {
        console.error("[payments.daraja.callback.amount] Amount did not match payment request.");
        return Response.json({ ResultCode: 1, ResultDesc: "Amount mismatch." }, { status: 400 });
      }
      if (payment.status !== "completed") {
        const { error: updateError } = await supabase
          .from("custom_trip_payments")
          .update({
            status: "completed",
            provider: "daraja",
            provider_status: resultDesc,
            confirmation_code: typeof receipt === "string" ? receipt : null,
            completed_at: new Date().toISOString(),
          })
          .eq("id", payment.id);
        if (updateError) throw new Error(updateError.message);
      }
    } else {
      if (payment.status !== "completed") {
        const { error: updateError } = await supabase
          .from("custom_trip_payments")
          .update({
            status: "created",
            provider: "daraja",
            provider_status: resultDesc,
            order_tracking_id: null,
            checkout_url: null,
            completed_at: null,
          })
          .eq("id", payment.id);
        if (updateError) throw new Error(updateError.message);
      }
    }

    void phone;
    return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    console.error("[payments.daraja.callback]", error instanceof Error ? error.message : "Unknown callback error.");
    return Response.json({ ResultCode: 1, ResultDesc: "Could not record callback." }, { status: 500 });
  }
}
