import "./install.ts?name=payment-webhook";
import "../../../supabase/functions/payment-webhook/index.ts";
import { finishCapture } from "./registry.ts";

export const handler = finishCapture("payment-webhook");
