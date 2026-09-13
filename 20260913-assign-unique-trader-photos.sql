-- Give every seeded trader a deterministic avatar with a name-aware presentation.
-- Run after the 75-trader seed migration.
-- Admin-uploaded avatars are intentionally preserved.

UPDATE public.traders
SET avatar_url = CASE
  -- Use branded marks for a larger portion of the roster.
  WHEN id % 5 IN (0, 1) THEN
    'https://api.dicebear.com/9.x/shapes/svg?seed='
    || replace(lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')), '--', '-')
  -- Use gendered portrait pools for the named roster; unknown names use a
  -- neutral deterministic portrait instead of guessing.
  WHEN split_part(lower(name), ' ', 1) IN (
    'sofia', 'priya', 'fatima', 'amina', 'amara', 'maya', 'isabella',
    'layla', 'sakura', 'aisha', 'aoife', 'zainab', 'noura', 'yara',
    'clara', 'mariam', 'anika', 'lucia', 'mina', 'nadine', 'lena',
    'hana', 'nia', 'helena', 'irene', 'emilia', 'leila', 'valentina',
    'nadia', 'sienna', 'elena', 'mei', 'freja', 'camila',
    'yuki', 'elif'
  ) THEN
    'https://randomuser.me/api/portraits/women/' || ((id * 7) % 90) || '.jpg'
  WHEN split_part(lower(name), ' ', 1) IN (
    'marcus', 'kenji', 'liam', 'daniel', 'ethan', 'victor', 'lucas',
    'james', 'oliver', 'mateo', 'ravi', 'nikolai', 'hugo', 'joon',
    'thomas', 'marek', 'diego', 'henrik', 'thiago', 'callum', 'andrej',
    'kofi', 'tomasz', 'ari', 'rafael', 'bastien', 'mikkel', 'arjun',
    'adrian', 'samuel', 'george', 'elias', 'kwame', 'omar', 'bruno',
    'luka', 'noah'
  ) THEN
    'https://randomuser.me/api/portraits/men/' || ((id * 7) % 90) || '.jpg'
  ELSE
    'https://i.pravatar.cc/300?u='
    || replace(lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')), '--', '-')
END
WHERE is_active = true
  AND (
    avatar_url IS NULL
    OR avatar_url = ''
    OR avatar_url LIKE '/images/avatar-%'
    OR avatar_url LIKE 'https://i.pravatar.cc/%'
    OR avatar_url LIKE 'https://randomuser.me/%'
    OR avatar_url LIKE 'https://api.dicebear.com/%'
  );

NOTIFY pgrST, 'reload schema';
