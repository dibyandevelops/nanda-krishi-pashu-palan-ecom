"use client";

type GqlRequestOptions = {
  operationName?: string;
  logErrors?: boolean;
};

function inferOperationName(query: string) {
  const match = query.match(/\b(?:query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (match?.[1]) {
    return match[1];
  }

  const normalized = query.replace(/\s+/g, " ");
  const topFieldMatch = normalized.match(/\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(|\{|\s)/);
  if (topFieldMatch?.[1]) {
    return topFieldMatch[1];
  }

  return "anonymous";
}

function shouldLogApiCalls() {
  return process.env.NEXT_PUBLIC_LOG_API_CALLS === "true";
}

function redactVariables(variables?: Record<string, unknown>) {
  if (!variables) {
    return variables;
  }

  const redacted: Record<string, unknown> = {};
  Object.entries(variables).forEach(([key, value]) => {
    if (key.toLowerCase().includes("password")) {
      redacted[key] = "***REDACTED***";
      return;
    }
    redacted[key] = value;
  });
  return redacted;
}

function shouldLogApiErrors(force?: boolean) {
  if (typeof force === "boolean") {
    return force;
  }
  return process.env.NEXT_PUBLIC_LOG_API_ERRORS === "true";
}

export async function gqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
  options?: GqlRequestOptions,
): Promise<T> {
  const operationName = options?.operationName || inferOperationName(query);

  if (shouldLogApiCalls()) {
    console.info("[GraphQL API Call]", {
      operationName,
      variables: redactVariables(variables),
    });
  }

  const url = `/api/graphql?op=${encodeURIComponent(operationName)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-gql-operation-name": operationName,
    },
    credentials: "include",
    body: JSON.stringify({
      query,
      variables,
      operationName: operationName !== "anonymous" ? operationName : undefined,
    }),
  });

  let payload: { data?: T; errors?: Array<{ message?: string }> } | undefined;
  try {
    payload = (await response.json()) as { data?: T; errors?: Array<{ message?: string }> };
  } catch {
    payload = undefined;
  }

  if (!response.ok || payload?.errors?.length || !payload?.data) {
    const message = payload?.errors?.[0]?.message || `GraphQL request failed (status ${response.status})`;
    if (shouldLogApiErrors(options?.logErrors)) {
      console.error("[GraphQL API Error]", {
        operationName,
        status: response.status,
        message,
        variables: redactVariables(variables),
        errors: payload?.errors || null,
      });
    }
    throw new Error(message);
  }

  return payload.data;
}
