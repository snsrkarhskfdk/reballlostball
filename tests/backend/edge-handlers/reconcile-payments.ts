import "./install.ts?name=reconcile-payments";
import "../../../supabase/functions/reconcile-payments/index.ts";
import { finishCapture } from "./registry.ts";

export const handler = finishCapture("reconcile-payments");
