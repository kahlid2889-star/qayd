import { createServerFn } from "@tanstack/react-start";

/** What the sign-in screen may offer. Read on the server so secrets never reach the browser. */
export const authOptions = createServerFn({ method: "GET" }).handler(async () => {
  const { googleConfigured } = await import("./server");
  return { google: googleConfigured };
});
