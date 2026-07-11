import "./install.ts?name=admin-members";
import "../../../supabase/functions/admin-members/index.ts";
import { finishCapture } from "./registry.ts";

export const handler = finishCapture("admin-members");
