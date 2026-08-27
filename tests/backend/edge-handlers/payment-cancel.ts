import "./install.ts?name=payment-cancel";
import "../../../supabase/functions/payment-cancel/index.ts";
import { finishCapture } from "./registry.ts";

export const handler = finishCapture("payment-cancel");
