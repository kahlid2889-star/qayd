import { createFileRoute } from "@tanstack/react-router";
import { QaydShell } from "@/components/qayd-shell";

export const Route = createFileRoute("/")({ component: QaydShell });
