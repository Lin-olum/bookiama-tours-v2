"use client";

import { useActionState } from "react";
import {
  startDarajaPayment,
  type CheckoutActionState,
} from "./actions";

const initialState: CheckoutActionState = { status: "idle" };

export default function PayButton({ paymentToken }: { paymentToken: string }) {
  const [state, action, isPending] = useActionState(
    startDarajaPayment,
    initialState,
  );

  return (
    <>
      <form action={action}>
        <input type="hidden" name="payment_token" value={paymentToken} />
        <label>
          <span>M-Pesa phone number</span>
          <input
            type="tel"
            name="phone"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0712345678"
            pattern="(?:0[17][0-9]{8}|254[17][0-9]{8}|[17][0-9]{8})"
            title="Enter a Kenyan mobile number, for example 0712345678 or 254712345678"
            required
          />
          <small>Safaricom will send an M-Pesa PIN prompt to this number.</small>
        </label>
        <button type="submit" disabled={isPending}>
          {isPending ? "Sending M-Pesa prompt..." : "Pay with M-Pesa"}
        </button>
      </form>
      {state.status === "error" && (
        <p className="payment-notice" role="alert">{state.message}</p>
      )}
      {state.status === "success" && (
        <p className="payment-notice" role="status">{state.message}</p>
      )}
    </>
  );
}
