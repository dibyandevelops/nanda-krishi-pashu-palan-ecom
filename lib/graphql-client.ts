"use client";

import { GraphQLClient } from "graphql-request";

export const gqlClient = new GraphQLClient("/api/graphql", {
  fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
});
