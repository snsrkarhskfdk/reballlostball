alter type public.ball_grade add value if not exists 'S' before 'A_PLUS';

create or replace function private.apply_general_brand_free_shipping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remote_surcharge integer := 0;
  v_total integer;
begin
  if exists (
    select 1
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    join public.product_variants v on v.id = oi.variant_id
    where oi.order_id = new.order_id
      and p.slug = 'general-brand-lostball'
      and v.pack_size = 100
      and v.grade in ('A'::public.ball_grade, 'B'::public.ball_grade)
  ) then
    select coalesce(max(z.surcharge_krw), 0)
    into v_remote_surcharge
    from public.orders o
    left join public.shipping_surcharge_zones z
      on z.active = true
     and coalesce(o.address_snapshot ->> 'zipCode', '') like z.postal_code_prefix || '%'
    where o.id = new.order_id;

    update public.orders
    set shipping_krw = v_remote_surcharge,
        total_krw = subtotal_krw - discount_krw + v_remote_surcharge,
        updated_at = now()
    where id = new.order_id
    returning total_krw into v_total;

    new.requested_amount := v_total;
  end if;

  return new;
end;
$$;

revoke all on function private.apply_general_brand_free_shipping() from public;

drop trigger if exists payments_apply_general_brand_free_shipping on public.payments;
create trigger payments_apply_general_brand_free_shipping
before insert on public.payments
for each row execute function private.apply_general_brand_free_shipping();
