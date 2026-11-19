"use client";

import { useActionState, useState } from "react";
import {
  createQuotationPaymentLink,
  type PaymentLinkActionState,
} from "./actions";

const initialState: PaymentLinkActionState = { status: "idle" };

export default function PaymentLinkForm({
  quotationId,
}: {
  quotationId: string;
}) {
  const [state, action, isPending] = useActionState(
    createQuotationPaymentLink,
    initialState,
  );
  const [copied, setCopied] = useState(false);

  async function copyPaymentLink() {
    if (state.status !== "success") return;
    await navigator.clipboard.writeText(state.paymentUrl);
    setCopied(true);
  }

  return (
    <div className="admin-payment-link">
      <form action={action}>
        <input type="hidden" name="quotation_id" value={quotationId} />
        <button type="submit" disabled={isPending}>
          {isPending ? "Creating link..." : "Create payment link"}
        </button>
      </form>
      {state.status === "success" && (
        <div className="admin-payment-link-result" role="status">
          <p>{state.message}</p>
          <div className="admin-payment-link-actions">
            <a href={state.paymentUrl} target="_blank" rel="noreferrer">
              Open customer payment page
            </a>
            <button type="button" onClick={copyPaymentLink}>
              {copied ? "Link copied" : "Copy link"}
            </button>
          </div>
          <input
            aria-label="Customer payment link"
            readOnly
            value={state.paymentUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
          <small>Send this link to the customer by email or phone.</small>
        </div>
      )}
      {state.status === "error" && (
        <p className="admin-save-message admin-save-message--error" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}
