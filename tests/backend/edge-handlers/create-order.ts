import "./install.ts?name=create-order";
import "../../../supabase/functions/create-order/index.ts";
import { finishCapture } from "./registry.ts";

export const handler = finishCapture("create-order");
