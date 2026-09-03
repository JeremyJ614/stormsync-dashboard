-- The Raffles module in the navigation, where it was asked for: directly under
-- the Loyalty Dashboard and above the FAQ.
--
-- `sort_order` 5 puts it after Loyalty (4) and well before Contact and FAQ,
-- which both sit at 900 as the tail of that section.
insert into public.nav_modules (module_id, label, section_id, sort_order, visible, admin_only)
select '/raffles', 'Raffles', n.section_id, 5, true, false
from public.nav_modules n
where n.module_id = '/loyalty'
on conflict (module_id) do update
  set label = excluded.label, section_id = excluded.section_id,
      sort_order = excluded.sort_order, visible = true, admin_only = false;
