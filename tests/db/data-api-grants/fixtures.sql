insert into auth.users(id,email) values
('11111111-1111-4111-8111-111111111111','member@example.invalid'),
('22222222-2222-4222-8222-222222222222','other@example.invalid'),
('33333333-3333-4333-8333-333333333333','store@example.invalid'),
('44444444-4444-4444-8444-444444444444','cs@example.invalid'),
('55555555-5555-4555-8555-555555555555','payments@example.invalid');
insert into public.user_roles(user_id,role) values
('33333333-3333-4333-8333-333333333333','store_manager'),
('44444444-4444-4444-8444-444444444444','cs_manager'),
('55555555-5555-4555-8555-555555555555','payments_manager');
insert into public.orders(id,profile_id,order_no,subtotal_krw,total_krw) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','GRANTS-A',10000,10000),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','GRANTS-B',10000,10000);
insert into public.pos_devices(name) values('synthetic existing POS');
