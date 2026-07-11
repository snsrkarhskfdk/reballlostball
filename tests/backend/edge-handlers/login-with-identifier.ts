import "./install.ts?name=login-with-identifier";
import "../../../supabase/functions/login-with-identifier/index.ts";
import { finishCapture } from "./registry.ts";

export const handler = finishCapture("login-with-identifier");
