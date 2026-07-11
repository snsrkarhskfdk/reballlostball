import "./install.ts?name=guest-order-lookup";
import "../../../supabase/functions/guest-order-lookup/index.ts";
import { finishCapture } from "./registry.ts";

export const handler = finishCapture("guest-order-lookup");
