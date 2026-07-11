import "./install.ts?name=get-order";
import "../../../supabase/functions/get-order/index.ts";
import { finishCapture } from "./registry.ts";

export const handler = finishCapture("get-order");
