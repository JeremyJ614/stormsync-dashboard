-- StormSync VIP — the prize catalogue.
--
-- One hundred prizes, twenty-five per draw, each described by the effects it
-- applies rather than by a single verb. Written out in full and replaced
-- wholesale rather than patched, because a half-migrated catalogue is a draw
-- that hands somebody the wrong thing.
--
-- RANK runs the other way from the list they were written in: rank 25 is the
-- best prize in a draw and rank 1 the smallest, which is the order the wheel
-- and the Raffles module read them in.
--
-- WEIGHT is the chance of being drawn, relative to the others in the same draw.
-- Three bands, exactly as specified: 100 for an ordinary prize, 50 for the ones
-- that should come up half as often, and 25 for the ones that should come up a
-- quarter as often. Nothing here is a percentage — `raffle_prize_odds` turns
-- these into percentages, so adding or retiring a prize cannot leave the odds
-- summing to something other than one.

-- The badge two of the draws hand out. It did not exist; a prize that awards a
-- badge nobody defined would award nothing.
insert into public.badge_defs (id, label, description, badge_group, icon, color, rarity)
values ('blessed-one', 'The Blessed One',
        'Drawn from the Blessed raffle — the rarest thing in the app.',
        'Achievement', 'Sparkles', '#d9b775', 'legendary')
on conflict (id) do update set
  label = excluded.label, description = excluded.description,
  badge_group = excluded.badge_group, rarity = excluded.rarity;

-- Replaced wholesale. Draws already run keep their history: `raffle_draws`
-- stores the prize label it handed over, not just the id.
alter table public.raffle_draws drop constraint if exists raffle_draws_prize_id_fkey;
delete from public.raffle_prizes;

insert into public.raffle_prizes (draw_type, rank, label, description, kind, config, weight, active)
values
  ('monthly', 25, 'A Free Month, Every Module', 'A month on us, with every module in the app switched on.', 'effects', '{"effects":[{"t":"free_months","months":1},{"t":"tier","tier":4,"months":1}]}'::jsonb, 100, true),
  ('monthly', 24, 'Two Free Months', 'Two months on the house.', 'effects', '{"effects":[{"t":"free_months","months":2}]}'::jsonb, 50, true),
  ('monthly', 23, '25% off Every Month for One Year', 'A quarter off every invoice for twelve months.', 'effects', '{"effects":[{"t":"discount","percent":25,"months":12}]}'::jsonb, 50, true),
  ('monthly', 22, 'One Free Month', 'Your next month, free.', 'effects', '{"effects":[{"t":"free_months","months":1}]}'::jsonb, 100, true),
  ('monthly', 21, '75% off Next Month', 'Three quarters off your next invoice.', 'effects', '{"effects":[{"t":"discount","percent":75,"months":1}]}'::jsonb, 100, true),
  ('monthly', 20, 'Outlooks, Alerts & Emergency Line', 'The top two rungs of the alert ladder — outlook alerts, the Emergency Contact PIN and the direct line.', 'effects', '{"effects":[{"t":"alert_levels","levels":[4,5]}]}'::jsonb, 100, true),
  ('monthly', 19, '60% off Next Month', 'Sixty per cent off your next invoice.', 'effects', '{"effects":[{"t":"discount","percent":60,"months":1}]}'::jsonb, 100, true),
  ('monthly', 18, 'Two Modules of your Choice, for Two Months', 'Pick any two modules and keep them for two months.', 'effects', '{"effects":[{"t":"module_credit","n":2,"months":2}]}'::jsonb, 100, true),
  ('monthly', 17, '50% off Next Month', 'Half off your next invoice.', 'effects', '{"effects":[{"t":"discount","percent":50,"months":1}]}'::jsonb, 100, true),
  ('monthly', 16, '1,000 Points', 'A thousand points straight onto the leaderboard.', 'effects', '{"effects":[{"t":"points","n":1000}]}'::jsonb, 100, true),
  ('monthly', 15, '40% off Next Month', 'Forty per cent off your next invoice.', 'effects', '{"effects":[{"t":"discount","percent":40,"months":1}]}'::jsonb, 100, true),
  ('monthly', 14, 'Storm Chasing Module', 'The Storm Chasing module. Already have it? Pick any module you do not. Have them all? Ten per cent off for every month you have been a member.', 'effects', '{"effects":[{"t":"modules","ids":["/chasing"],"months":null,"else":{"t":"module_credit","n":1,"months":null,"else":{"t":"discount","percent":10,"months":null,"months_from_membership":true}}}]}'::jsonb, 100, true),
  ('monthly', 13, '30% off the Next 4 Months', 'Thirty per cent off, four invoices running.', 'effects', '{"effects":[{"t":"discount","percent":30,"months":4}]}'::jsonb, 100, true),
  ('monthly', 12, 'Steal 900 Points', 'Take 300 points from each of the year''s top three, whenever you choose.', 'effects', '{"effects":[{"t":"points_steal","each":300,"from_top":3}]}'::jsonb, 100, true),
  ('monthly', 11, '2,000 Points', 'Two thousand points.', 'effects', '{"effects":[{"t":"points","n":2000}]}'::jsonb, 100, true),
  ('monthly', 10, '25% off the Next 6 Months', 'A quarter off, six invoices running.', 'effects', '{"effects":[{"t":"discount","percent":25,"months":6}]}'::jsonb, 100, true),
  ('monthly', 9, '3 Monthly, Yearly and Random Tickets, plus a Blessed Ticket', 'Three of each of the three, and one of the one you cannot earn.', 'effects', '{"effects":[{"t":"tickets","monthly":3,"yearly":3,"random":3,"blessed":1}]}'::jsonb, 25, true),
  ('monthly', 8, '20% off the Next 8 Months', 'A fifth off, eight invoices running.', 'effects', '{"effects":[{"t":"discount","percent":20,"months":8}]}'::jsonb, 100, true),
  ('monthly', 7, '1,500 Points', 'Fifteen hundred points.', 'effects', '{"effects":[{"t":"points","n":1500}]}'::jsonb, 100, true),
  ('monthly', 6, '15% off for One Year', 'Fifteen per cent off every invoice for a year.', 'effects', '{"effects":[{"t":"discount","percent":15,"months":12}]}'::jsonb, 100, true),
  ('monthly', 5, 'Start the Next 3 Months off with 750 Points', 'Seven hundred and fifty points at the top of each of the next three months.', 'effects', '{"effects":[{"t":"points_monthly","n":750,"months":3}]}'::jsonb, 100, true),
  ('monthly', 4, 'Everything is 100% Free for 2 Months', 'Two months free with every module switched on.', 'effects', '{"effects":[{"t":"free_months","months":2},{"t":"tier","tier":4,"months":2}]}'::jsonb, 100, true),
  ('monthly', 3, 'Start the Next 6 Months off with 500 Points', 'Five hundred points at the top of each of the next six months.', 'effects', '{"effects":[{"t":"points_monthly","n":500,"months":6}]}'::jsonb, 100, true),
  ('monthly', 2, 'Personal Graphic Created', 'Jay makes you any graphic you want — a chase poster, a profile piece, anything.', 'effects', '{"effects":[{"t":"manual","detail":"A custom graphic, designed personally"}]}'::jsonb, 100, true),
  ('monthly', 1, '3 Monthly Tickets, 2 Yearly', 'Three monthly tickets and two yearly.', 'effects', '{"effects":[{"t":"tickets","monthly":3,"yearly":2}]}'::jsonb, 100, true),
  ('yearly', 25, 'Advanced Tier for Life', 'Advanced, permanently. Every module, every alert level, for as long as the app exists.', 'effects', '{"effects":[{"t":"tier","tier":4,"months":null}]}'::jsonb, 25, true),
  ('yearly', 24, 'A Chase Seat', 'A seat in the car on a chase day.', 'effects', '{"effects":[{"t":"manual","detail":"A seat in the chase vehicle"}]}'::jsonb, 50, true),
  ('yearly', 23, 'One Year of Advanced Tier', 'Advanced for twelve months. Already have it for life? Two Blessed tickets instead.', 'effects', '{"effects":[{"t":"tier","tier":4,"months":12,"else":{"t":"tickets","blessed":2}}]}'::jsonb, 50, true),
  ('yearly', 22, '50% off Every Month for One Year', 'Half off every invoice for a year.', 'effects', '{"effects":[{"t":"discount","percent":50,"months":12}]}'::jsonb, 100, true),
  ('yearly', 21, 'Six Free Months', 'Half a year, free.', 'effects', '{"effects":[{"t":"free_months","months":6}]}'::jsonb, 100, true),
  ('yearly', 20, 'Three Free Months, 1,000 Points and a Blessed Ticket', 'A quarter of a year free, a thousand points, and a ticket to the draw you cannot earn.', 'effects', '{"effects":[{"t":"free_months","months":3},{"t":"points","n":1000},{"t":"tickets","blessed":1}]}'::jsonb, 100, true),
  ('yearly', 19, '40% off Every Month for One Year', 'Forty per cent off every invoice for a year.', 'effects', '{"effects":[{"t":"discount","percent":40,"months":12}]}'::jsonb, 100, true),
  ('yearly', 18, 'Three Free Months', 'Three months, free.', 'effects', '{"effects":[{"t":"free_months","months":3}]}'::jsonb, 100, true),
  ('yearly', 17, '25% off Every Month for Two Years', 'A quarter off every invoice for two years.', 'effects', '{"effects":[{"t":"discount","percent":25,"months":24}]}'::jsonb, 100, true),
  ('yearly', 16, 'One Free Month with Every Module, Tickets and 750 Points', 'A free month with everything switched on, two monthly and two random tickets, and 750 points.', 'effects', '{"effects":[{"t":"free_months","months":1},{"t":"tier","tier":4,"months":1},{"t":"tickets","monthly":2,"random":2},{"t":"points","n":750}]}'::jsonb, 100, true),
  ('yearly', 15, 'Steal 2,100 Points', 'Take 700 points from each of the year''s top three, whenever you choose.', 'effects', '{"effects":[{"t":"points_steal","each":700,"from_top":3}]}'::jsonb, 100, true),
  ('yearly', 14, 'The Discount Ladder', 'Eighty per cent off next month, seventy the month after, and down by ten every month until it runs out.', 'effects', '{"effects":[{"t":"ladder","steps":[80,70,60,50,40,30,20,10]}]}'::jsonb, 100, true),
  ('yearly', 13, 'Pick Two Modules of your Choice, for Life', 'Two modules, yours permanently, whatever your subscription does. Already have everything? Your name goes on the wall in gold.', 'effects', '{"effects":[{"t":"module_credit","n":2,"months":null,"else":{"t":"engraving","slot":"engraved"}}]}'::jsonb, 100, true),
  ('yearly', 12, 'SSWX Beta Access', 'First look at everything we launch for the next year, free.', 'effects', '{"effects":[{"t":"beta_access","months":12,"detail":"Early access to everything we launch"}]}'::jsonb, 100, true),
  ('yearly', 11, 'The Discount Ladder II', 'Next month free, then 75% off, then 50, then 25.', 'effects', '{"effects":[{"t":"ladder","steps":[100,75,50,25]}]}'::jsonb, 100, true),
  ('yearly', 10, 'The Connection', 'Three free months, and a referral code that gives whoever uses it three free months of your exact tier.', 'effects', '{"effects":[{"t":"free_months","months":3},{"t":"referral_gift","detail":"Your code gives a friend three free months at your tier","gift":{"t":"free_months","months":3}}]}'::jsonb, 100, true),
  ('yearly', 9, 'Name Engraved, 1,000 Points, 90% off the Next 2 Months', 'Your name on the wall, a thousand points, and nine tenths off two invoices.', 'effects', '{"effects":[{"t":"engraving","slot":"engraved"},{"t":"points","n":1000},{"t":"discount","percent":90,"months":2}]}'::jsonb, 100, true),
  ('yearly', 8, 'Steal 3,000 Points', 'Take 1,000 points from each of the year''s top three, whenever you choose.', 'effects', '{"effects":[{"t":"points_steal","each":1000,"from_top":3}]}'::jsonb, 50, true),
  ('yearly', 7, '2,500 Points', 'Twenty-five hundred points.', 'effects', '{"effects":[{"t":"points","n":2500}]}'::jsonb, 25, true),
  ('yearly', 6, '1,750 Points', 'Seventeen hundred and fifty points.', 'effects', '{"effects":[{"t":"points","n":1750}]}'::jsonb, 50, true),
  ('yearly', 5, '1,250 Points', 'Twelve hundred and fifty points.', 'effects', '{"effects":[{"t":"points","n":1250}]}'::jsonb, 100, true),
  ('yearly', 4, 'One Free Month, plus 5 Monthly, 1 Yearly, 3 Random and a Blessed Ticket', 'A free month and a fistful of tickets.', 'effects', '{"effects":[{"t":"free_months","months":1},{"t":"tickets","monthly":5,"yearly":1,"random":3,"blessed":1}]}'::jsonb, 25, true),
  ('yearly', 3, 'Two Free Months, plus 3 Monthly, 1 Yearly and 1 Random Ticket', 'Two free months and a handful of tickets.', 'effects', '{"effects":[{"t":"free_months","months":2},{"t":"tickets","monthly":3,"yearly":1,"random":1}]}'::jsonb, 100, true),
  ('yearly', 2, 'The Ultimate Raffle Prize', 'You draw one prize from Monthly, one from Random and one from Blessed — yourself.', 'effects', '{"effects":[{"t":"extra_draw","draws":["monthly","random","blessed"],"detail":"Draw a prize yourself"}]}'::jsonb, 25, true),
  ('yearly', 1, 'Willy Wonka''s Golden Ticket', 'Everything on the app, free, for life.', 'effects', '{"effects":[{"t":"free_months","months":null},{"t":"tier","tier":4,"months":null}]}'::jsonb, 25, true),
  ('random', 25, 'One Free Month', 'Your next month, free.', 'effects', '{"effects":[{"t":"free_months","months":1}]}'::jsonb, 100, true),
  ('random', 24, '75% off Next Month', 'Three quarters off your next invoice.', 'effects', '{"effects":[{"t":"discount","percent":75,"months":1}]}'::jsonb, 100, true),
  ('random', 23, 'Two Free Months', 'Two months on the house.', 'effects', '{"effects":[{"t":"free_months","months":2}]}'::jsonb, 100, true),
  ('random', 22, '50% off Next Month', 'Half off your next invoice.', 'effects', '{"effects":[{"t":"discount","percent":50,"months":1}]}'::jsonb, 100, true),
  ('random', 21, 'Two Free Modules for This Month and Next', 'Pick two modules and keep them for two months.', 'effects', '{"effects":[{"t":"module_credit","n":2,"months":2,"else":{"t":"tickets","monthly":1,"yearly":1}}]}'::jsonb, 100, true),
  ('random', 20, '40% off Next Month', 'Forty per cent off your next invoice.', 'effects', '{"effects":[{"t":"discount","percent":40,"months":1}]}'::jsonb, 100, true),
  ('random', 19, 'Storm Chasing Module', 'The Storm Chasing module — or any module you do not have.', 'effects', '{"effects":[{"t":"modules","ids":["/chasing"],"months":null,"else":{"t":"module_credit","n":1,"months":null,"else":{"t":"tickets","monthly":1,"yearly":1}}}]}'::jsonb, 100, true),
  ('random', 18, '30% off Next Month', 'Thirty per cent off your next invoice.', 'effects', '{"effects":[{"t":"discount","percent":30,"months":1}]}'::jsonb, 100, true),
  ('random', 17, '30% off Next Month and a Blessed Ticket', 'Thirty per cent off, and a ticket to the draw you cannot earn.', 'effects', '{"effects":[{"t":"discount","percent":30,"months":1},{"t":"tickets","blessed":1}]}'::jsonb, 50, true),
  ('random', 16, '25% off Next Month', 'A quarter off your next invoice.', 'effects', '{"effects":[{"t":"discount","percent":25,"months":1}]}'::jsonb, 100, true),
  ('random', 15, 'Any Module of your Choice', 'Pick any module. It is yours.', 'effects', '{"effects":[{"t":"module_credit","n":1,"months":null}]}'::jsonb, 100, true),
  ('random', 14, '20% off Next Month and a Monthly Ticket', 'A fifth off, and a ticket.', 'effects', '{"effects":[{"t":"discount","percent":20,"months":1},{"t":"tickets","monthly":1}]}'::jsonb, 100, true),
  ('random', 13, '1,000 Points', 'A thousand points.', 'effects', '{"effects":[{"t":"points","n":1000}]}'::jsonb, 100, true),
  ('random', 12, '“The Blessed One” — Ultra Rare Badge', 'The rarest badge in the app.', 'effects', '{"effects":[{"t":"badge","id":"blessed-one"}]}'::jsonb, 25, true),
  ('random', 11, 'Name Engravement', 'Your name on the wall on the home page.', 'effects', '{"effects":[{"t":"engraving","slot":"engraved"}]}'::jsonb, 100, true),
  ('random', 10, '750 Points', 'Seven hundred and fifty points.', 'effects', '{"effects":[{"t":"points","n":750}]}'::jsonb, 100, true),
  ('random', 9, '15% off Next Month and 2 Monthly Tickets', 'Fifteen per cent off, and two tickets.', 'effects', '{"effects":[{"t":"discount","percent":15,"months":1},{"t":"tickets","monthly":2}]}'::jsonb, 100, true),
  ('random', 8, '500 Points and a Monthly Ticket', 'Five hundred points and a ticket.', 'effects', '{"effects":[{"t":"points","n":500},{"t":"tickets","monthly":1}]}'::jsonb, 100, true),
  ('random', 7, '10% off Next Month and 3 Monthly Tickets', 'A tenth off, and three tickets.', 'effects', '{"effects":[{"t":"discount","percent":10,"months":1},{"t":"tickets","monthly":3}]}'::jsonb, 100, true),
  ('random', 6, '500 Points, 2 Monthly and 1 Random Ticket', 'Five hundred points and three tickets.', 'effects', '{"effects":[{"t":"points","n":500},{"t":"tickets","monthly":2,"random":1}]}'::jsonb, 100, true),
  ('random', 5, '10% off the Next 3 Months and 2 Monthly Tickets', 'A tenth off three invoices, and two tickets.', 'effects', '{"effects":[{"t":"discount","percent":10,"months":3},{"t":"tickets","monthly":2}]}'::jsonb, 100, true),
  ('random', 4, '15% off the Next 2 Months and 2 Monthly Tickets', 'Fifteen per cent off two invoices, and two tickets.', 'effects', '{"effects":[{"t":"discount","percent":15,"months":2},{"t":"tickets","monthly":2}]}'::jsonb, 100, true),
  ('random', 3, '25% off the Next 2 Months and a Monthly Ticket', 'A quarter off two invoices, and a ticket.', 'effects', '{"effects":[{"t":"discount","percent":25,"months":2},{"t":"tickets","monthly":1}]}'::jsonb, 100, true),
  ('random', 2, '35% off the Next 2 Months', 'Thirty-five per cent off two invoices.', 'effects', '{"effects":[{"t":"discount","percent":35,"months":2}]}'::jsonb, 100, true),
  ('random', 1, '45% off the Next 2 Months', 'Forty-five per cent off two invoices.', 'effects', '{"effects":[{"t":"discount","percent":45,"months":2}]}'::jsonb, 100, true),
  ('blessed', 25, 'The Blessed Name Engravement', 'The one name at the top of the wall, lit and moving, above everybody else''s. Only one person holds it at a time.', 'effects', '{"effects":[{"t":"engraving","slot":"blessed"}]}'::jsonb, 100, true),
  ('blessed', 24, 'Two Years of Advanced', 'Advanced tier for two years. Already have it for life? Three of every ticket instead.', 'effects', '{"effects":[{"t":"tier","tier":4,"months":24,"else":{"t":"tickets","monthly":3,"yearly":3,"random":3,"blessed":3}}]}'::jsonb, 100, true),
  ('blessed', 23, 'Six Free Months', 'Half a year, free.', 'effects', '{"effects":[{"t":"free_months","months":6}]}'::jsonb, 100, true),
  ('blessed', 22, '50% off Every Month for a Year', 'Half off every invoice for a year.', 'effects', '{"effects":[{"t":"discount","percent":50,"months":12}]}'::jsonb, 100, true),
  ('blessed', 21, 'Three Free Months, then 75% off, then 50%', 'Three months free, then a quarter of the price, then half.', 'effects', '{"effects":[{"t":"ladder","steps":[100,100,100,75,50]}]}'::jsonb, 100, true),
  ('blessed', 20, '25% off for Two Years', 'A quarter off every invoice for two years.', 'effects', '{"effects":[{"t":"discount","percent":25,"months":24}]}'::jsonb, 100, true),
  ('blessed', 19, '50% off for Life', 'Half price. For ever.', 'effects', '{"effects":[{"t":"discount","percent":50,"months":null}]}'::jsonb, 50, true),
  ('blessed', 18, '25% off for Life', 'A quarter off. For ever.', 'effects', '{"effects":[{"t":"discount","percent":25,"months":null}]}'::jsonb, 100, true),
  ('blessed', 17, '“The Blessed One” — Ultra Rare Badge', 'The rarest badge in the app.', 'effects', '{"effects":[{"t":"badge","id":"blessed-one"}]}'::jsonb, 100, true),
  ('blessed', 16, 'Pick 3 Modules, Yours for Life', 'Three modules that stay yours whatever your subscription does. Already have everything? Two of every ticket instead.', 'effects', '{"effects":[{"t":"module_credit","n":3,"months":null,"else":{"t":"tickets","monthly":2,"yearly":2,"random":2,"blessed":2}}]}'::jsonb, 100, true),
  ('blessed', 15, '75% off for One Year', 'Three quarters off every invoice for a year.', 'effects', '{"effects":[{"t":"discount","percent":75,"months":12}]}'::jsonb, 100, true),
  ('blessed', 14, '5,000 Points', 'Five thousand points.', 'effects', '{"effects":[{"t":"points","n":5000}]}'::jsonb, 50, true),
  ('blessed', 13, '75% off for Two Years', 'Three quarters off every invoice for two years.', 'effects', '{"effects":[{"t":"discount","percent":75,"months":24}]}'::jsonb, 25, true),
  ('blessed', 12, '50% off for Two Years', 'Half off every invoice for two years.', 'effects', '{"effects":[{"t":"discount","percent":50,"months":24}]}'::jsonb, 50, true),
  ('blessed', 11, 'One Free Month, plus 5 Monthly, 1 Yearly, 3 Random and a Blessed Ticket', 'A free month and a fistful of tickets.', 'effects', '{"effects":[{"t":"free_months","months":1},{"t":"tickets","monthly":5,"yearly":1,"random":3,"blessed":1}]}'::jsonb, 100, true),
  ('blessed', 10, 'The Ultimate Connection', 'Half price for two years, and a referral code that gives a friend the same thing at your tier.', 'effects', '{"effects":[{"t":"discount","percent":50,"months":24},{"t":"referral_gift","detail":"Your code gives a friend 50% off for two years at your tier","gift":{"t":"discount","percent":50,"months":24}}]}'::jsonb, 50, true),
  ('blessed', 9, 'Willy Wonka''s Golden Ticket', 'Everything on the app, free, for life.', 'effects', '{"effects":[{"t":"free_months","months":null},{"t":"tier","tier":4,"months":null}]}'::jsonb, 25, true),
  ('blessed', 8, '3,000 Points and 3 Monthly Tickets', 'Three thousand points and three tickets.', 'effects', '{"effects":[{"t":"points","n":3000},{"t":"tickets","monthly":3}]}'::jsonb, 50, true),
  ('blessed', 7, 'The Ultimate Raffle Prize', 'You draw one prize from Monthly, one from Random and one from Blessed — yourself.', 'effects', '{"effects":[{"t":"extra_draw","draws":["monthly","random","blessed"],"detail":"Draw a prize yourself"}]}'::jsonb, 100, true),
  ('blessed', 6, '2,000 Points, 5 Monthly, 2 Yearly and 3 Random Tickets', 'Two thousand points and ten tickets.', 'effects', '{"effects":[{"t":"points","n":2000},{"t":"tickets","monthly":5,"yearly":2,"random":3}]}'::jsonb, 50, true),
  ('blessed', 5, 'Steal 4,200 Points', 'Take 1,400 points from each of the year''s top three, whenever you choose.', 'effects', '{"effects":[{"t":"points_steal","each":1400,"from_top":3}]}'::jsonb, 100, true),
  ('blessed', 4, 'Wipe Out', 'Everyone ranked fifth and below goes to zero, and every point they had becomes yours.', 'effects', '{"effects":[{"t":"points_wipe","below_rank":5}]}'::jsonb, 100, true),
  ('blessed', 3, '1,500 Points, 5 Monthly, 3 Yearly and 7 Random Tickets', 'Fifteen hundred points and fifteen tickets.', 'effects', '{"effects":[{"t":"points","n":1500},{"t":"tickets","monthly":5,"yearly":3,"random":7}]}'::jsonb, 100, true),
  ('blessed', 2, '1,000 Points and 28 Tickets', 'A thousand points, seven monthly, five yearly, fifteen random and a Blessed.', 'effects', '{"effects":[{"t":"points","n":1000},{"t":"tickets","monthly":7,"yearly":5,"random":15,"blessed":1}]}'::jsonb, 25, true),
  ('blessed', 1, 'SSWX Secret Prize', 'Jay handles this one personally. That is all anybody gets told.', 'effects', '{"effects":[{"t":"manual","detail":"The secret prize \u2014 handled personally"}]}'::jsonb, 25, true);
