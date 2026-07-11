import "./install.ts?name=signup-with-login-id";
import "../../../supabase/functions/signup-with-login-id/index.ts";
import { finishCapture } from "./registry.ts";

export const handler = finishCapture("signup-with-login-id");
