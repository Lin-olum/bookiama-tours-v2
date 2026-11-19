import "server-only";

export type DarajaStkResponse = {
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
};

function getApiBaseUrl() {
  const environment = process.env.MPESA_ENVIRONMENT ?? "sandbox";
  if (environment === "sandbox") return "https://sandbox.safaricom.co.ke";
  if (environment === "production") return "https://api.safaricom.co.ke";
  throw new Error("MPESA_ENVIRONMENT must be sandbox or production.");
}

async function readJson(response: Response, operation: string): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "errorMessage" in body &&
      typeof body.errorMessage === "string"
        ? body.errorMessage
        : `Safaricom Daraja ${operation} failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function normalizeKenyanPhone(value: string): string | null {
  const digits = value.replace(/[^0-9]/g, "");
  if (/^(?:254)\d{9}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^7\d{8}$/.test(digits) || /^1\d{8}$/.test(digits)) return `254${digits}`;
  return null;
}

export async function getDarajaAccessToken() {
  const key = requiredEnv("MPESA_CONSUMER_KEY");
  const secret = requiredEnv("MPESA_CONSUMER_SECRET");
  const credentials = Buffer.from(`${key}:${secret}`).toString("base64");
  const response = await fetch(
    `${getApiBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${credentials}` },
      cache: "no-store",
    },
  );
  const body = await readJson(response, "authentication");
  if (
    typeof body !== "object" || body === null || !("access_token" in body) ||
    typeof body.access_token !== "string" || !body.access_token
  ) {
    throw new Error("Safaricom Daraja returned an invalid access token.");
  }
  return body.access_token;
}

export async function initiateDarajaStkPush(input: {
  phone: string;
  amount: number;
  accountReference: string;
  description: string;
  callbackUrl: string;
}) {
  const accessToken = await getDarajaAccessToken();
  const shortCode = requiredEnv("MPESA_SHORTCODE");
  const passkey = requiredEnv("MPESA_PASSKEY");
  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
  const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString("base64");

  const amount = Math.round(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("The M-Pesa amount must be a positive whole number.");
  }

  const response = await fetch(`${getApiBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: input.phone,
      PartyB: shortCode,
      PhoneNumber: input.phone,
      CallBackURL: input.callbackUrl,
      AccountReference: input.accountReference.replace(/[^A-Za-z0-9]/g, "").slice(0, 12),
      TransactionDesc: input.description.slice(0, 13),
    }),
    cache: "no-store",
  });
  const body = await readJson(response, "STK Push");
  if (typeof body !== "object" || body === null) {
    throw new Error("Safaricom Daraja returned an invalid STK Push response.");
  }
  const getString = (key: string) => {
    const value = (body as Record<string, unknown>)[key];
    return typeof value === "string" ? value : "";
  };
  if (getString("ResponseCode") !== "0") {
    throw new Error(getString("CustomerMessage") || getString("ResponseDescription") || "M-Pesa could not start the payment request.");
  }

  return {
    merchantRequestId: getString("MerchantRequestID"),
    checkoutRequestId: getString("CheckoutRequestID"),
    responseCode: getString("ResponseCode"),
    responseDescription: getString("ResponseDescription"),
    customerMessage: getString("CustomerMessage"),
  } satisfies DarajaStkResponse;
}
