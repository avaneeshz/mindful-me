-- Phase 2: seed the system catalog from app/src/data/activities.ts (generated —
-- see the full-stack-engineer session that authored this migration for the
-- generator; regenerate and add a new migration if the catalog changes, never
-- hand-edit the rows this produced).
do $$
declare
  card_id uuid;
  sub_id uuid;
begin
  insert into public.activities (name, category_id, icon_key) values ('Night Sleep', 'mind', 'Moon') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Day Sleep', 'mind', 'BedDouble') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Brushing + Shower', 'body', 'ShowerHead') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Clothes maintenance', 'body', 'Shirt') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Writing — author journey', 'focus', 'PenLine') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Image generation', 'focus', 'Palette') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Homework', 'focus', 'BookOpen') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Meal Prep', 'body', 'Utensils') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Nursery visit', 'body', 'Sprout') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Star Bazar visit', 'body', 'ShoppingCart') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Vipassana', 'mind', 'Flower2') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Nature connect', 'nature', 'Leaf') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Sunlight', card_id, 'Leaf');
  insert into public.activities (name, parent_id, icon_key) values ('Breathwork', card_id, 'Leaf');
  insert into public.activities (name, parent_id, icon_key) values ('Star sleeping', card_id, 'Leaf');
  insert into public.activities (name, category_id, icon_key) values ('Sports or Exercise', 'sports', 'Footprints') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Dance', card_id, 'Footprints');
  insert into public.activities (name, parent_id, icon_key) values ('Skipping', card_id, 'Footprints');
  insert into public.activities (name, parent_id, icon_key) values ('Running', card_id, 'Footprints');
  insert into public.activities (name, parent_id, icon_key) values ('HIIT', card_id, 'Footprints');
  insert into public.activities (name, parent_id, icon_key) values ('Suryanamaskar', card_id, 'Footprints');
  insert into public.activities (name, parent_id, icon_key) values ('Moonnamaskar', card_id, 'Footprints');
  insert into public.activities (name, category_id, icon_key) values ('YouTube watching', 'mind', 'Tv') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Human connection', 'nature', 'Users') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('GEOM / HOSS / HECOLL', 'focus', 'Rocket') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Spiritual Care', 'nature', 'HeartHandshake') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Singing time / worship time', card_id, 'HeartHandshake');
  insert into public.activities (name, parent_id, icon_key) values ('Bible reading', card_id, 'HeartHandshake');
  insert into public.activities (name, parent_id, icon_key) values ('Prayer', card_id, 'HeartHandshake');
  insert into public.activities (name, category_id, icon_key) values ('Building & Rebuilding', 'focus', 'Headphones') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Podcasts', card_id, 'Headphones');
  insert into public.activities (name, parent_id, icon_key) values ('Audiobook', card_id, 'Headphones');
  insert into public.activities (name, category_id, icon_key) values ('Errand time', 'body', 'Car') returning id into card_id;
  insert into public.activities (name, category_id, icon_key) values ('Pomodoro Break', 'mind', 'Timer') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Eating leaves', card_id, 'Timer');
  insert into public.activities (name, parent_id, icon_key) values ('CCTV Control Station', card_id, 'Timer');
  insert into public.activities (name, parent_id, icon_key) values ('Stretching', card_id, 'Timer');
  insert into public.activities (name, parent_id, icon_key) values ('Humor content', card_id, 'Timer');
  insert into public.activities (name, category_id, icon_key) values ('Body care', 'body', 'Droplet') returning id into card_id;
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
  insert into public.activities (name, category_id, icon_key) values ('Supplements', 'mind', 'Pill') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Omega', card_id, 'Pill');
  insert into public.activities (name, parent_id, icon_key) values ('Magnesium', card_id, 'Pill');
  insert into public.activities (name, parent_id, icon_key) values ('Zinc', card_id, 'Pill');
  insert into public.activities (name, category_id, icon_key) values ('Gmeet / Zoom', 'focus', 'Video') returning id into card_id;
  insert into public.activities (name, parent_id, icon_key) values ('Coach', card_id, 'Video');
  insert into public.activities (name, parent_id, icon_key) values ('Therapist', card_id, 'Video');
  insert into public.activities (name, parent_id, icon_key) values ('Cofounder', card_id, 'Video');
  insert into public.activities (name, parent_id, icon_key) values ('Personal Board of Director', card_id, 'Video');
  insert into public.activities (name, category_id, icon_key) values ('Miscellaneous', 'body', 'Sparkles') returning id into card_id;
end $$;
