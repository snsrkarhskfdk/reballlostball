import "./install.ts?name=payment-confirm";
import "../../../supabase/functions/payment-confirm/index.ts";
import { finishCapture } from "./registry.ts";

export const handler = finishCapture("payment-confirm");
