-- Data API grants must not depend on Supabase's historical default privileges.
-- Additive and safe to replay. RLS policies, RPC ACLs and default ACLs are unchanged.
-- UUID defaults use gen_random_uuid(): no sequence grant is needed.

-- These policies already enforce ownership and reject admin-managed insert state.
-- Updates/deletes (including replies, resolutions and POS writes) remain RPC-only.
grant select, insert on public.customer_inquiries, public.return_requests
  to authenticated;
grant select on public.pos_devices to authenticated;

-- Edge Functions use serviceSelect for these resources. BYPASSRLS does not bypass
-- table ACL checks. Mutations run in the existing actor-checked SECURITY DEFINER
-- RPCs, so the service API needs SELECT only, not direct INSERT/UPDATE/DELETE.
grant select on public.customer_inquiries, public.return_requests, public.pos_devices,
  public.brands, public.banners, public.benefit_policies, public.reviews,
  public.admin_audit_logs, public.store_profile, public.policy_versions
  to service_role;

-- No anon/PUBLIC grants, blanket grants, default-privilege changes or RLS changes.
-- Existing installations may retain legacy wider ACLs; tightening those is a
-- separate rollout requiring a complete consumer audit, not part of this repair.
