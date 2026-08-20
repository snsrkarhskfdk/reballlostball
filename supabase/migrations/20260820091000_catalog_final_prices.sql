insert into public.brands (slug, name, sort_order, active)
values
  ('titleist', '타이틀리스트', 1, true),
  ('taylormade', '테일러메이드', 2, true),
  ('bridgestone', '브리지스톤', 3, true),
  ('callaway', '캘러웨이', 4, true),
  ('srixon', '스릭슨', 5, true),
  ('volvik', '볼빅', 6, true),
  ('saintnine', '세인트나인', 7, true),
  ('mix', '브랜드혼합', 8, true),
  ('general', '일반브랜드', 9, true)
on conflict (slug) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    active = true;

with desired_products(brand_slug, slug, name, subtitle, summary, base_price_krw) as (
  values
    ('titleist', 'titleist-pro-v1-v1x-lostball', '타이틀리스트 로스트볼', 'PRO V1 / PRO V1X / AVX / 일반 2피스', 'PRO V1·PRO V1X S등급 5구와 A+·A·B 등급별 실제 판매 구성을 제공합니다.', 10000),
    ('taylormade', 'taylormade-tp5-lostball', '테일러메이드 로스트볼', 'TP5 / TP5 Pix / 투어 리스폰스', 'TP5, TP5 Pix, 투어 리스폰스를 등급과 구성별 실제 단가로 제공합니다.', 14000),
    ('bridgestone', 'bridgestone-tour-b-lostball', '브리지스톤 로스트볼', 'TOUR B / E12 / 일반(JGB·스트레이트)', 'TOUR B, E12, 일반 그룹을 등급과 구성별 실제 단가로 제공합니다.', 12000),
    ('callaway', 'callaway-chrome-tour-lostball', '캘러웨이 CHROME TOUR 로스트볼', '크롬 / ERC / 트리플트랙 그룹', '캘러웨이 크롬, ERC, 트리플트랙 그룹을 실제 판매 구성으로 제공합니다.', 15000),
    ('srixon', 'srixon-z-star-lostball', '스릭슨 로스트볼', 'Z-STAR / Z-STAR 반반 / Q-STAR 반반 / 일반', 'Z-STAR와 반반볼, 일반 그룹을 등급과 구성별 실제 단가로 제공합니다.', 8000),
    ('volvik', 'volvik-lostball', '볼빅 로스트볼', '볼빅 화이트 / 컬러 브랜드 그룹', '볼빅 화이트와 컬러 제품을 등급별 실제 판매 구성으로 선별합니다.', 8000),
    ('saintnine', 'saintnine-lostball', '세인트나인 로스트볼', '세인트나인 브랜드 그룹', '세인트나인 브랜드 그룹을 등급과 구성별 실제 단가로 제공합니다.', 9000),
    ('mix', 'brand-mix-lostball', '브랜드혼합 로스트볼', '화이트 / 컬러 혼합', 'A+ 10구와 A·B 100구로 구성한 브랜드혼합 라인입니다.', 6000),
    ('general', 'general-brand-lostball', '일반브랜드 로스트볼', '일반브랜드 화이트 / 컬러', 'A+ 10구와 무료배송 A·B 100구로 구성한 일반브랜드 라인입니다.', 6000)
)
insert into public.products (
  brand_id, slug, name, subtitle, summary, sale_type,
  base_price_krw, featured, active, updated_at
)
select
  b.id, d.slug, d.name, d.subtitle, d.summary, 'lostball',
  d.base_price_krw, true, true, now()
from desired_products d
join public.brands b on b.slug = d.brand_slug
on conflict (slug) do update
set brand_id = excluded.brand_id,
    name = excluded.name,
    subtitle = excluded.subtitle,
    summary = excluded.summary,
    base_price_krw = excluded.base_price_krw,
    featured = excluded.featured,
    active = true,
    updated_at = now();

create temporary table reball_existing_catalog_stock on commit drop as
select
  p.slug,
  coalesce(v.option_model, '') as option_model,
  v.grade,
  v.pack_size,
  sum(greatest(v.stock_qty, 0))::integer as stock_qty
from public.product_variants v
join public.products p on p.id = v.product_id
where p.slug in (
  'titleist-pro-v1-v1x-lostball', 'taylormade-tp5-lostball',
  'bridgestone-tour-b-lostball', 'callaway-chrome-tour-lostball',
  'srixon-z-star-lostball', 'volvik-lostball', 'saintnine-lostball',
  'brand-mix-lostball', 'general-brand-lostball'
)
group by p.slug, coalesce(v.option_model, ''), v.grade, v.pack_size;

update public.product_variants v
set active = false
from public.products p
where p.id = v.product_id
  and p.slug in (
    'titleist-pro-v1-v1x-lostball', 'taylormade-tp5-lostball',
    'bridgestone-tour-b-lostball', 'callaway-chrome-tour-lostball',
    'srixon-z-star-lostball', 'volvik-lostball', 'saintnine-lostball',
    'brand-mix-lostball', 'general-brand-lostball'
  );

with desired(slug, model, grade, pack_size, price_krw, color, thumbnail_url) as (
  values
    ('titleist-pro-v1-v1x-lostball', 'PRO V1', 'S'::public.ball_grade, 5, 17000, '화이트', 'product-actual/titleist-pro-v1-01.webp'),
    ('titleist-pro-v1-v1x-lostball', 'PRO V1', 'A_PLUS'::public.ball_grade, 10, 27000, '화이트', 'product-actual/titleist-pro-v1-01.webp'),
    ('titleist-pro-v1-v1x-lostball', 'PRO V1', 'A'::public.ball_grade, 10, 20000, '화이트', 'product-actual/titleist-pro-v1-03.webp'),
    ('titleist-pro-v1-v1x-lostball', 'PRO V1', 'B'::public.ball_grade, 30, 35000, '화이트', 'product-actual/titleist-pro-v1-05.webp'),
    ('titleist-pro-v1-v1x-lostball', 'PRO V1X', 'S'::public.ball_grade, 5, 17000, '화이트', 'product-actual/titleist-pro-v1x-01.webp'),
    ('titleist-pro-v1-v1x-lostball', 'PRO V1X', 'A_PLUS'::public.ball_grade, 10, 27000, '화이트', 'product-actual/titleist-pro-v1x-01.webp'),
    ('titleist-pro-v1-v1x-lostball', 'PRO V1X', 'A'::public.ball_grade, 10, 20000, '화이트', 'product-actual/titleist-pro-v1x-03.webp'),
    ('titleist-pro-v1-v1x-lostball', 'PRO V1X', 'B'::public.ball_grade, 30, 35000, '화이트', 'product-actual/titleist-pro-v1x-05.webp'),
    ('titleist-pro-v1-v1x-lostball', 'AVX', 'A_PLUS'::public.ball_grade, 10, 22000, '화이트', 'product-actual/titleist-pro-v1-01.webp'),
    ('titleist-pro-v1-v1x-lostball', 'AVX', 'A'::public.ball_grade, 10, 15000, '화이트', 'product-actual/titleist-pro-v1-03.webp'),
    ('titleist-pro-v1-v1x-lostball', 'AVX', 'B'::public.ball_grade, 30, 30000, '화이트', 'product-actual/titleist-pro-v1-05.webp'),
    ('titleist-pro-v1-v1x-lostball', '일반(2피스)', 'A_PLUS'::public.ball_grade, 10, 17000, '화이트', 'product-actual/titleist-pro-v1-01.webp'),
    ('titleist-pro-v1-v1x-lostball', '일반(2피스)', 'A'::public.ball_grade, 10, 10000, '화이트', 'product-actual/titleist-pro-v1-03.webp'),
    ('titleist-pro-v1-v1x-lostball', '일반(2피스)', 'B'::public.ball_grade, 30, 20000, '화이트', 'product-actual/titleist-pro-v1-05.webp'),
    ('taylormade-tp5-lostball', 'TP5', 'A_PLUS'::public.ball_grade, 10, 26000, '화이트', 'product-variants/taylormade-tp5-a-plus.webp'),
    ('taylormade-tp5-lostball', 'TP5', 'A'::public.ball_grade, 10, 19000, '화이트', 'product-actual/taylormade-03.webp'),
    ('taylormade-tp5-lostball', 'TP5', 'B'::public.ball_grade, 30, 33000, '화이트', 'product-actual/taylormade-05.webp'),
    ('taylormade-tp5-lostball', 'TP5 Pix', 'A_PLUS'::public.ball_grade, 10, 26000, '화이트', 'product-actual/taylormade-01.webp'),
    ('taylormade-tp5-lostball', 'TP5 Pix', 'A'::public.ball_grade, 10, 19000, '화이트', 'product-actual/taylormade-03.webp'),
    ('taylormade-tp5-lostball', '투어 리스폰스', 'A_PLUS'::public.ball_grade, 10, 23000, '화이트', 'product-actual/taylormade-01.webp'),
    ('taylormade-tp5-lostball', '투어 리스폰스', 'A'::public.ball_grade, 10, 18000, '화이트', 'product-actual/taylormade-03.webp'),
    ('taylormade-tp5-lostball', '투어 리스폰스', 'B'::public.ball_grade, 10, 14000, '화이트', 'product-actual/taylormade-05.webp'),
    ('bridgestone-tour-b-lostball', 'TOUR B', 'A_PLUS'::public.ball_grade, 10, 22000, '화이트', 'product-variants/bridgestone-tour-b-s.webp'),
    ('bridgestone-tour-b-lostball', 'TOUR B', 'A'::public.ball_grade, 10, 15000, '화이트', 'product-variants/bridgestone-tour-b-a.webp'),
    ('bridgestone-tour-b-lostball', 'TOUR B', 'B'::public.ball_grade, 30, 30000, '화이트', 'product-variants/bridgestone-tour-b-a-minus.webp'),
    ('bridgestone-tour-b-lostball', 'E12', 'A_PLUS'::public.ball_grade, 10, 17000, '화이트', 'product-variants/bridgestone-tour-b-s.webp'),
    ('bridgestone-tour-b-lostball', 'E12', 'A'::public.ball_grade, 10, 12000, '화이트', 'product-variants/bridgestone-tour-b-a.webp'),
    ('bridgestone-tour-b-lostball', 'E12', 'B'::public.ball_grade, 30, 27000, '화이트', 'product-variants/bridgestone-e12-a-minus-white.webp'),
    ('bridgestone-tour-b-lostball', '일반(JGB·스트레이트)', 'A_PLUS'::public.ball_grade, 10, 13000, '화이트', 'product-variants/bridgestone-tour-b-s.webp'),
    ('bridgestone-tour-b-lostball', '일반(JGB·스트레이트)', 'A'::public.ball_grade, 30, 27000, '화이트', 'product-variants/bridgestone-tour-b-a.webp'),
    ('srixon-z-star-lostball', 'Z-STAR', 'A_PLUS'::public.ball_grade, 10, 18000, '화이트', 'product-variants/srixon-general-a-plus.webp'),
    ('srixon-z-star-lostball', 'Z-STAR', 'A'::public.ball_grade, 10, 12000, '화이트', 'product-variants/srixon-general-a.webp'),
    ('srixon-z-star-lostball', 'Z-STAR', 'B'::public.ball_grade, 30, 27000, '화이트', 'product-variants/srixon-general-a-minus.webp'),
    ('srixon-z-star-lostball', 'Z-STAR 반반', 'A_PLUS'::public.ball_grade, 10, 22000, '화이트', 'product-variants/srixon-general-a-plus.webp'),
    ('srixon-z-star-lostball', 'Z-STAR 반반', 'A'::public.ball_grade, 10, 18000, '화이트', 'product-variants/srixon-general-a.webp'),
    ('srixon-z-star-lostball', 'Q-STAR 반반', 'A_PLUS'::public.ball_grade, 10, 21000, '화이트', 'product-variants/srixon-general-a-plus.webp'),
    ('srixon-z-star-lostball', 'Q-STAR 반반', 'A'::public.ball_grade, 10, 17000, '화이트', 'product-variants/srixon-general-a.webp'),
    ('srixon-z-star-lostball', '일반(소프트필·Q·T)', 'A_PLUS'::public.ball_grade, 10, 12000, '화이트', 'product-variants/srixon-general-a-plus.webp'),
    ('srixon-z-star-lostball', '일반(소프트필·Q·T)', 'A'::public.ball_grade, 10, 8000, '화이트', 'product-variants/srixon-general-a.webp'),
    ('callaway-chrome-tour-lostball', '크롬·ERC·트리플트랙', 'A_PLUS'::public.ball_grade, 10, 22000, '화이트', 'product-variants/callaway-general-a-plus.webp'),
    ('callaway-chrome-tour-lostball', '크롬·ERC·트리플트랙', 'A'::public.ball_grade, 10, 15000, '화이트', 'product-variants/callaway-general-a.webp'),
    ('callaway-chrome-tour-lostball', '크롬·ERC·트리플트랙', 'B'::public.ball_grade, 30, 30000, '화이트', 'product-actual/callaway-05.webp'),
    ('saintnine-lostball', '세인트나인', 'A_PLUS'::public.ball_grade, 10, 13000, '화이트', 'product-variants/saintnine-a-plus.webp'),
    ('saintnine-lostball', '세인트나인', 'A'::public.ball_grade, 10, 9000, '화이트', 'product-variants/saintnine-a.webp'),
    ('saintnine-lostball', '세인트나인', 'B'::public.ball_grade, 30, 20000, '화이트', 'product-variants/saintnine-a-minus.webp'),
    ('volvik-lostball', '볼빅', 'A_PLUS'::public.ball_grade, 10, 12000, '혼합', 'product-variants/volvik-white-a-plus.webp'),
    ('volvik-lostball', '볼빅', 'A'::public.ball_grade, 10, 8000, '혼합', 'product-variants/volvik-white-a.webp'),
    ('volvik-lostball', '볼빅', 'B'::public.ball_grade, 30, 19000, '혼합', 'product-variants/volvik-white-a-minus.webp'),
    ('brand-mix-lostball', '브랜드혼합', 'A_PLUS'::public.ball_grade, 10, 6000, '혼합', 'product-actual/general-color-a-plus-01.webp'),
    ('brand-mix-lostball', '브랜드혼합', 'A'::public.ball_grade, 100, 40000, '혼합', 'gallery/mix-01.jpg'),
    ('brand-mix-lostball', '브랜드혼합', 'B'::public.ball_grade, 100, 40000, '혼합', 'gallery/mix-02.jpg'),
    ('general-brand-lostball', '일반브랜드', 'A_PLUS'::public.ball_grade, 10, 6000, '혼합', 'product-actual/general-white-a-plus-01.webp'),
    ('general-brand-lostball', '일반브랜드', 'A'::public.ball_grade, 100, 35000, '혼합', 'product-actual/general-white-a-plus-01.webp'),
    ('general-brand-lostball', '일반브랜드', 'B'::public.ball_grade, 100, 35000, '혼합', 'product-actual/general-color-a-plus-01.webp')
), normalized as (
  select
    d.*,
    'RB-260820-' || upper(substr(md5(concat_ws('|', d.slug, d.model, d.grade::text, d.pack_size::text, d.color)), 1, 16)) as sku
  from desired d
)
insert into public.product_variants (
  product_id, sku, option_model, option_color, option_design, grade,
  pack_size, price_krw, compare_at_krw, stock_qty, thumbnail_url, active
)
select
  p.id,
  n.sku,
  n.model,
  n.color,
  null,
  n.grade,
  n.pack_size,
  n.price_krw,
  null,
  coalesce(s.stock_qty, 0),
  n.thumbnail_url,
  true
from normalized n
join public.products p on p.slug = n.slug
left join reball_existing_catalog_stock s
  on s.slug = n.slug
 and s.option_model = n.model
 and s.grade = n.grade
 and s.pack_size = n.pack_size
on conflict (sku) do update
set product_id = excluded.product_id,
    option_model = excluded.option_model,
    option_color = excluded.option_color,
    option_design = excluded.option_design,
    grade = excluded.grade,
    pack_size = excluded.pack_size,
    price_krw = excluded.price_krw,
    compare_at_krw = excluded.compare_at_krw,
    stock_qty = excluded.stock_qty,
    thumbnail_url = excluded.thumbnail_url,
    active = true;
