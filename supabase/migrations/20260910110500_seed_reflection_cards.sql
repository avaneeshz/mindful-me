-- Seed the 18 reflection cards verbatim from app/src/data/reflectionCards.ts
-- (REFLECTION_CARDS) as system defaults (created_by null) — nothing already
-- shown to Deepthi is lost. `image_key` names the bundled illustration
-- asset (`assets/reflection-cards/icon-NN.png`) the client already ships;
-- never hand-edit these rows — regenerate from reflectionCards.ts if the
-- topic list changes.
insert into public.reflection_cards (number, title, subtitle, image_key) values
  (1, 'Somatic', 'Sensation, pain, release & embodiment', 'icon-01'),
  (2, 'Parts', 'Inner parts, conflict & harmony', 'icon-02'),
  (3, 'Internal Systems', 'HOS architecture & system interaction', 'icon-03'),
  (4, 'Operating Environment', 'Physical, social & energetic ecosystem', 'icon-04'),
  (5, 'Identities', 'Roles, identities & self-concept', 'icon-05'),
  (6, 'Thoughts', 'Rumination, intrusive, scattered & distortions', 'icon-06'),
  (7, 'Boundaries', 'Assert, enforce, negotiate & observe', 'icon-07'),
  (8, 'Couldn''t ask/tell', 'Freeze, silence, patterns & blocks', 'icon-08'),
  (9, 'Decisions', 'Choices, indecision, inaction & clarity', 'icon-09'),
  (10, 'Need more Evidence', 'Validation, certainty & more data', 'icon-10'),
  (11, 'Needs', 'What I need vs what''s met', 'icon-11'),
  (12, 'Values', 'Alignment, others'' values & value expression', 'icon-12'),
  (13, 'What Helped?', 'Support, nourishment & elevating moments', 'icon-13'),
  (14, 'What Made it Worse?', 'Triggers, drains & setbacks', 'icon-14'),
  (15, 'Beliefs', 'Limiting vs expanding, mine & others''', 'icon-15'),
  (16, 'Emotions', 'Emotional state, balance & shifts', 'icon-16'),
  (17, 'Self Harm', 'Urges, patterns, self-sabotage', 'icon-17'),
  (18, 'Self Preservation', 'Safety, protection & resource care', 'icon-18');
