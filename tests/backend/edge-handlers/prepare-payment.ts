import "./install.ts?name=prepare-payment";
import "../../../supabase/functions/prepare-payment/index.ts";
import { finishCapture } from "./registry.ts";

export const handler = finishCapture("prepare-payment");
