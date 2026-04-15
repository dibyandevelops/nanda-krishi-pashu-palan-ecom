import { createHmac, randomUUID } from "crypto";

export type EsewaCheckoutPayload = {
  amount: string;
  tax_amount: string;
  total_amount: string;
  transaction_uuid: string;
  product_code: string;
  product_service_charge: string;
  product_delivery_charge: string;
  success_url: string;
  failure_url: string;
  signed_field_names: string;
  signature: string;
};

type EsewaStatusResponse = {
  status?: string;
  state?: string;
  transaction_uuid?: string;
  total_amount?: string | number;
  product_code?: string;
  data?: {
    status?: string;
    state?: string;
    transaction_uuid?: string;
    total_amount?: string | number;
  };
  transaction_details?: {
    status?: string;
    state?: string;
    transaction_uuid?: string;
    total_amount?: string | number;
  };
};

export function createEsewaSignature({
  totalAmount,
  transactionUuid,
  productCode,
  secret,
}: {
  totalAmount: string;
  transactionUuid: string;
  productCode: string;
  secret: string;
}) {
  const message = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${productCode}`;

  return createHmac("sha256", secret).update(message).digest("base64");
}

export function createEsewaPayload({
  totalAmount,
  successUrl,
  failureUrl,
  transactionUuid,
}: {
  totalAmount: number;
  successUrl: string;
  failureUrl: string;
  transactionUuid?: string;
}): EsewaCheckoutPayload {
  const totalAmountFixed = totalAmount.toFixed(2);
  const productCode = process.env.ESEWA_PRODUCT_CODE || "EPAYTEST";
  const secret = process.env.ESEWA_SECRET_KEY || "8gBm/:&EnhH.1/q";
  const txUuid = transactionUuid || randomUUID();

  const signature = createEsewaSignature({
    totalAmount: totalAmountFixed,
    transactionUuid: txUuid,
    productCode,
    secret,
  });

  return {
    amount: totalAmountFixed,
    tax_amount: "0",
    total_amount: totalAmountFixed,
    transaction_uuid: txUuid,
    product_code: productCode,
    product_service_charge: "0",
    product_delivery_charge: "0",
    success_url: successUrl,
    failure_url: failureUrl,
    signed_field_names: "total_amount,transaction_uuid,product_code",
    signature,
  };
}

export async function verifyEsewaTransaction({
  transactionUuid,
  totalAmount,
}: {
  transactionUuid: string;
  totalAmount: number;
}) {
  const statusUrl =
    process.env.ESEWA_STATUS_CHECK_URL ||
    "https://rc-epay.esewa.com.np/api/epay/transaction/status/";
  const productCode = process.env.ESEWA_PRODUCT_CODE || "EPAYTEST";
  const totalAmountFixed = totalAmount.toFixed(2);

  const url = new URL(statusUrl);
  url.searchParams.set("product_code", productCode);
  url.searchParams.set("total_amount", totalAmountFixed);
  url.searchParams.set("transaction_uuid", transactionUuid);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to verify payment with eSewa");
  }

  const payload = (await response.json()) as EsewaStatusResponse;
  const resolvedStatus = (
    payload.status ||
    payload.state ||
    payload.data?.status ||
    payload.data?.state ||
    payload.transaction_details?.status ||
    payload.transaction_details?.state ||
    ""
  ).toUpperCase();
  const responseTransactionUuid =
    payload.transaction_uuid ||
    payload.data?.transaction_uuid ||
    payload.transaction_details?.transaction_uuid ||
    "";
  const rawAmount =
    payload.total_amount ??
    payload.data?.total_amount ??
    payload.transaction_details?.total_amount;

  const expectedAmount = Number(totalAmountFixed);
  const receivedAmount = rawAmount === undefined ? Number.NaN : Number(rawAmount);

  const isComplete = resolvedStatus === "COMPLETE" || resolvedStatus === "SUCCESS";
  const matchesTransaction = responseTransactionUuid.toLowerCase() === transactionUuid.toLowerCase();
  const matchesAmount =
    Number.isFinite(receivedAmount) ? Math.abs(receivedAmount - expectedAmount) < 0.01 : true;

  if (!isComplete || !matchesTransaction || !matchesAmount) {
    throw new Error("Payment verification failed with eSewa");
  }

  return true;
}
