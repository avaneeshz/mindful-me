-- Data-integrity bug fix, not scope creep (found while implementing the
-- picker-layout/quality/flags work): PR #9 expanded the CLIENT catalog
-- (app/src/data/activities.ts) from 24 items/5 categories to 53 items/9
-- categories, but never touched this table. `public.activities` was still
-- only the old 24-card catalog under `activities_category_id_check`'s old
-- 5-value enum ('mind','body','sports','nature','focus'). Client-side,
-- `catalogIdForName` (app/src/api/catalog.ts) returns null for any of the
-- ~29 new items PR #9 added, and `scheduleParams` then sends
-- `p_activity_id: null` for a real, nonzero-duration activity — which either
-- violates `flag_marker_has_no_duration` or otherwise mis-shapes the row.
-- Every one of those new items is broken for sync today, for anyone with
-- Supabase configured.
--
-- Only 3 EXISTING `scheduled_activities` rows reference a system-catalog
-- activity by id (verified live, not assumed): 'Day Sleep', 'Writing —
-- author journey' and 'Image generation'. None of the other ~58 system rows
-- (old top-level cards and their old sub/third options) are referenced by
-- anything, so they can be deleted outright with zero FK risk — verified via
-- a live join, not guessed. The 3 referenced rows are UPDATEd to a correct
-- new category in place rather than deleted, since `activities.activity_id`
-- has no ON DELETE CASCADE/SET NULL and a live row pointing at a deleted
-- activity would break `to_scheduled_activity_dto`'s read path.
--
-- 'Day Sleep' keeps its EXACT name in the new catalog too (only its category
-- changed), so it is the one item excluded from the reseed block below —
-- inserting a second 'Day Sleep' row would produce two top-level rows with
-- the same name (parent_id NULL doesn't collide under
-- `activities_parent_id_name_key`'s UNIQUE, since Postgres treats NULLs as
-- distinct — so it would silently succeed, not error), leaving
-- `catalogIdForName('Day Sleep')` to resolve to whichever row the query
-- happens to return last. The other two renamed items ('Writing — author
-- journey' -> 'Author writing', 'Image generation' -> 'Image Generation')
-- don't collide — their new names are literally different strings — so the
-- old rows stay untouched (historical, still referenced) and the reseed
-- below adds the new names as genuinely new rows.

-- Drop the old 5-value check entirely first: it would otherwise reject the
-- category UPDATEs below (still validated against the OLD enum) before the
-- new one is added at the end of this migration.
alter table public.activities drop constraint activities_category_id_check;

-- The 3 referenced legacy rows: recategorized under the new 9-tile scheme,
-- identity/name otherwise untouched (819/72adf.../b2268d... are their real
-- ids, confirmed live).
update public.activities set category_id = 'sleep' where id = 'ca538b0f-2322-413f-96c0-b93eff709787'; -- Day Sleep (mind -> sleep)
update public.activities set category_id = 'work' where id = '72adf698-cf05-4462-a138-ab1391c4b1c6'; -- Writing — author journey (focus -> work, matches its "Author writing" successor's tile)
update public.activities set category_id = 'growth' where id = 'b2268d38-b238-4561-8de9-ebee08afb812'; -- Image generation (focus -> growth, matches its "Image Generation" successor's tile)

-- Every other system-catalog row (unreferenced by any live scheduled
-- activity — verified above) is stale relative to the current client
-- catalog. `activities_parent_id_fkey`'s `ON DELETE CASCADE` takes their old
-- sub/third rows with them in the same statement.
delete from public.activities
where created_by is null
  and id not in (
    'ca538b0f-2322-413f-96c0-b93eff709787',
    '72adf698-cf05-4462-a138-ab1391c4b1c6',
    'b2268d38-b238-4561-8de9-ebee08afb812'
  );

-- Reseed: the full current 53-item catalog (app/src/data/activities.ts),
-- generated the same way the original seed migration was (never hand-edit
-- these rows — regenerate from data/activities.ts if the catalog changes).
-- 'Day Sleep' is deliberately excluded — see the comment at the top of this
-- file; its existing row was recategorized above instead.
do $$
declare
  card_id uuid;
  sub_id uuid;
begin
  insert into public.activities (name, category_id, icon_key) values ('Night Sleep', 'sleep', 'Moon') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Bed Exercise', 'sleep', 'Dumbbell') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Supplements', 'sleep', 'Pill') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Zinc (post-breakfast)', card_id, 'Pill');
  insert into public.activities (name, parent_id, icon_key) values ('Omega (post-lunch)', card_id, 'Pill');
  insert into public.activities (name, parent_id, icon_key) values ('Magnesium (post-dinner)', card_id, 'Pill');
  insert into public.activities (name, parent_id, icon_key) values ('Ayurveda — skin healing', card_id, 'Pill');
  insert into public.activities (name, parent_id, icon_key) values ('Ayurveda — fibroid healing', card_id, 'Pill');
  insert into public.activities (name, parent_id, icon_key) values ('Ayurveda — varicose veins', card_id, 'Pill');
  insert into public.activities (name, parent_id, icon_key) values ('MultiVitamin (on Chums days)', card_id, 'Pill');
  insert into public.activities (name, category_id, icon_key) values ('Slow down', 'sleep', 'Wind') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Soaking/Sprouting/Grinding', 'food', 'Sprout') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Meal Prep', 'food', 'Utensils') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Breakfast', card_id, 'Utensils');
  insert into public.activities (name, parent_id, icon_key) values ('Lunch', card_id, 'Utensils');
  insert into public.activities (name, parent_id, icon_key) values ('Early Dinner', card_id, 'Utensils');
  insert into public.activities (name, parent_id, icon_key) values ('Later Dinner', card_id, 'Utensils');
  insert into public.activities (name, category_id, icon_key) values ('Eating', 'food', 'Soup') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Dish washing', 'food', 'Droplets') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Liquids', 'food', 'Coffee') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Flower tea', card_id, 'Coffee');
  insert into public.activities (name, parent_id, icon_key) values ('Leaves tea', card_id, 'Coffee');
  insert into public.activities (name, parent_id, icon_key) values ('Roots tea', card_id, 'Coffee');
  insert into public.activities (name, parent_id, icon_key) values ('100% Cocoa', card_id, 'Coffee');
  insert into public.activities (name, parent_id, icon_key) values ('Seeds tea', card_id, 'Coffee');
  insert into public.activities (name, parent_id, icon_key) values ('Coconut water', card_id, 'Coffee');
  insert into public.activities (name, parent_id, icon_key) values ('Chia Basil', card_id, 'Coffee');
  insert into public.activities (name, parent_id, icon_key) values ('Lassi', card_id, 'Coffee');
  insert into public.activities (name, parent_id, icon_key) values ('Apple Cider Vinegar', card_id, 'Coffee');
  insert into public.activities (name, category_id, icon_key) values ('Gut', 'food', 'Activity') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Chums Support', 'food', 'HandHeart') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Mishti Doi', card_id, 'HandHeart');
  insert into public.activities (name, parent_id, icon_key) values ('Shrikhand', card_id, 'HandHeart');
  insert into public.activities (name, parent_id, icon_key) values ('Yakult', card_id, 'HandHeart');
  insert into public.activities (name, category_id, icon_key) values ('Oral Care', 'care', 'Sparkle') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Bath ritual', 'care', 'Bath') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Hair Care', 'care', 'Scissors') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Body Care (self)', 'care', 'Droplet') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Massage', card_id, 'Droplet') returning id into sub_id;
  insert into public.activities (name, parent_id, icon_key) values ('Face', sub_id, 'Droplet');
  insert into public.activities (name, parent_id, icon_key) values ('Body', sub_id, 'Droplet');
  insert into public.activities (name, parent_id, icon_key) values ('Hair', sub_id, 'Droplet');
  insert into public.activities (name, parent_id, icon_key) values ('Oiling', card_id, 'Droplet') returning id into sub_id;
  insert into public.activities (name, parent_id, icon_key) values ('Face', sub_id, 'Droplet');
  insert into public.activities (name, parent_id, icon_key) values ('Body', sub_id, 'Droplet');
  insert into public.activities (name, parent_id, icon_key) values ('Hair', sub_id, 'Droplet');
  insert into public.activities (name, parent_id, icon_key) values ('Mask', card_id, 'Droplet') returning id into sub_id;
  insert into public.activities (name, parent_id, icon_key) values ('Face', sub_id, 'Droplet');
  insert into public.activities (name, parent_id, icon_key) values ('Body', sub_id, 'Droplet');
  insert into public.activities (name, parent_id, icon_key) values ('Hair', sub_id, 'Droplet');
  insert into public.activities (name, category_id, icon_key) values ('Body Care (outsourced)', 'care', 'HandHeart') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Entertainment (YouTube)', 'downtime', 'Youtube') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Commuting', 'downtime', 'TrainFront') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Metro', card_id, 'TrainFront');
  insert into public.activities (name, parent_id, icon_key) values ('Train', card_id, 'TrainFront');
  insert into public.activities (name, parent_id, icon_key) values ('Bus', card_id, 'TrainFront');
  insert into public.activities (name, parent_id, icon_key) values ('Auto', card_id, 'TrainFront');
  insert into public.activities (name, parent_id, icon_key) values ('Cab', card_id, 'TrainFront');
  insert into public.activities (name, parent_id, icon_key) values ('Flight', card_id, 'TrainFront');
  insert into public.activities (name, category_id, icon_key) values ('Doing Nothing', 'downtime', 'CircleDashed') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Errand time', 'downtime', 'ShoppingCart') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Pomodoro Break', 'downtime', 'Timer') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Eating leaves', card_id, 'Timer');
  insert into public.activities (name, parent_id, icon_key) values ('CCTV Control Station', card_id, 'Timer');
  insert into public.activities (name, parent_id, icon_key) values ('Stretching', card_id, 'Timer');
  insert into public.activities (name, parent_id, icon_key) values ('Humor content', card_id, 'Timer');
  insert into public.activities (name, category_id, icon_key) values ('Sports or Exercise', 'movement', 'Footprints') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Dance', card_id, 'Footprints');
  insert into public.activities (name, parent_id, icon_key) values ('Skipping', card_id, 'Footprints');
  insert into public.activities (name, parent_id, icon_key) values ('Running', card_id, 'Footprints');
  insert into public.activities (name, parent_id, icon_key) values ('HIIT', card_id, 'Footprints');
  insert into public.activities (name, parent_id, icon_key) values ('Suryanamaskar', card_id, 'Footprints');
  insert into public.activities (name, parent_id, icon_key) values ('Moonnamaskar', card_id, 'Footprints');
  insert into public.activities (name, parent_id, icon_key) values ('Swimming', card_id, 'Footprints');
  insert into public.activities (name, parent_id, icon_key) values ('Badminton', card_id, 'Footprints');
  insert into public.activities (name, category_id, icon_key) values ('Breathwork', 'movement', 'Wind') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Walking', 'movement', 'Footprints') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Vipassana', 'movement', 'Flower2') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Acupressure', 'movement', 'Hand') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Acupuncture', 'movement', 'Syringe') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Physio Injury Prevention', 'movement', 'ShieldPlus') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('GEOM', 'work', 'Building2') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Experiments', 'work', 'FlaskConical') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Relational Field Experiments', card_id, 'FlaskConical');
  insert into public.activities (name, parent_id, icon_key) values ('Survival Edge Experiment', card_id, 'FlaskConical');
  insert into public.activities (name, parent_id, icon_key) values ('HOSS experiments', card_id, 'FlaskConical');
  insert into public.activities (name, parent_id, icon_key) values ('Yoga', card_id, 'FlaskConical');
  insert into public.activities (name, parent_id, icon_key) values ('Surya Namaskar', card_id, 'FlaskConical');
  insert into public.activities (name, parent_id, icon_key) values ('Moon Namaskar', card_id, 'FlaskConical');
  insert into public.activities (name, category_id, icon_key) values ('Work', 'work', 'Briefcase') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Deep', card_id, 'Briefcase');
  insert into public.activities (name, parent_id, icon_key) values ('Shallow', card_id, 'Briefcase');
  insert into public.activities (name, parent_id, icon_key) values ('Creative', card_id, 'Briefcase');
  insert into public.activities (name, category_id, icon_key) values ('Gmeet calls', 'work', 'Video') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Cofounder', card_id, 'Video');
  insert into public.activities (name, parent_id, icon_key) values ('Personal Board of Director', card_id, 'Video');
  insert into public.activities (name, parent_id, icon_key) values ('Other', card_id, 'Video');
  insert into public.activities (name, category_id, icon_key) values ('Author writing', 'work', 'PenLine') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Spiritual Care', 'nature', 'HeartHandshake') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Singing / worship time', card_id, 'HeartHandshake');
  insert into public.activities (name, parent_id, icon_key) values ('Prayer', card_id, 'HeartHandshake');
  insert into public.activities (name, parent_id, icon_key) values ('Bible reading', card_id, 'HeartHandshake');
  insert into public.activities (name, parent_id, icon_key) values ('Gratitude', card_id, 'HeartHandshake');
  insert into public.activities (name, parent_id, icon_key) values ('Manifestation', card_id, 'HeartHandshake');
  insert into public.activities (name, category_id, icon_key) values ('Daily Sunlight', 'nature', 'Sun') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Ocean Contact', 'nature', 'Waves') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Forest walk', 'nature', 'TreePine') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Star sleeping', 'nature', 'BedSingle') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Nursery visit', 'nature', 'Sprout') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Gardening', 'nature', 'Trees') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Building & Rebuilding', 'growth', 'Headphones') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Podcasts', card_id, 'Headphones');
  insert into public.activities (name, parent_id, icon_key) values ('Audiobook', card_id, 'Headphones');
  insert into public.activities (name, category_id, icon_key) values ('Human Connection', 'growth', 'Users') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Therapy', 'growth', 'HandHeart') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Coaching', 'growth', 'GraduationCap') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Homework', 'growth', 'Table2') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Image Generation', 'growth', 'Image') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Learning', 'growth', 'Lightbulb') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('New Skills', card_id, 'Lightbulb');
  insert into public.activities (name, parent_id, icon_key) values ('New competency', card_id, 'Lightbulb');
  insert into public.activities (name, parent_id, icon_key) values ('New capacity', card_id, 'Lightbulb');
  insert into public.activities (name, category_id, icon_key) values ('Mopping/Brooming', 'home', 'Sparkles') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Study table clean', 'home', 'Table2') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Clothes maintenance', 'home', 'Zap') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Star Bazar visit', 'home', 'ShoppingCart') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Clean Toilets', 'home', 'Droplets') returning id into card_id;
end $$;

-- Finally, the strict new 9-tile constraint. By this point every remaining
-- system row (the 3 recategorized legacy rows, the freshly-reseeded 53-item
-- catalog and its sub/third rows) already carries a valid new value, so this
-- validates cleanly with no old-scheme values left anywhere.
alter table public.activities
  add constraint activities_category_id_check
  check (category_id = any (array['sleep','food','care','downtime','movement','work','nature','growth','home']));
