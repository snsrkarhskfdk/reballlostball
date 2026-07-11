import "./install.ts?name=auth-assist";
import "../../../supabase/functions/auth-assist/index.ts";
import { finishCapture } from "./registry.ts";

export const handler = finishCapture("auth-assist");
