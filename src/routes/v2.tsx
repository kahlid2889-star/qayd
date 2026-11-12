import { createFileRoute } from "@tanstack/react-router";
import { V2Shell } from "@/v2/V2Shell";

/** The rebuilt accounts / friends / online shell, served beside the original at "/". */
export const Route = createFileRoute("/v2")({ component: V2Shell });
