-- Backfill: mapeia primeiro nome (sem acentos) para um apelido real brasileiro.
-- Aplica apenas em perfis fictícios "logados" (created_by_admin IS NOT NULL).

WITH map(first_key, nick) AS (
  VALUES
    -- Masculinos
    ('rodrigo','Digo'), ('fernando','Nando'), ('eduardo','Edu'),
    ('ricardo','Rick'), ('leonardo','Léo'), ('guilherme','Gui'),
    ('gustavo','Guto'), ('henrique','Henri'), ('felipe','Lipe'),
    ('carlos','Cacá'), ('joao','Jão'), ('pedro','Pedrão'),
    ('paulo','Paulinho'), ('thiago','Thi'), ('tiago','Thi'),
    ('marcelo','Celo'), ('marcos','Marquinhos'), ('bruno','Bruninho'),
    ('daniel','Dani'), ('vinicius','Vini'), ('gabriel','Biel'),
    ('rafael','Rafa'), ('lucas','Luquinhas'), ('matheus','Theus'),
    ('mateus','Theus'), ('diego','Di'), ('andre','Dé'),
    ('alexandre','Xande'), ('antonio','Tonho'), ('jose','Zé'),
    ('francisco','Chico'), ('roberto','Beto'), ('ronaldo','Naldo'),
    ('fabio','Fabinho'), ('sergio','Serginho'), ('gean','Geca'),
    ('igor','Igorzinho'), ('caio','Caião'), ('arthur','Tutu'),
    ('artur','Tutu'), ('bernardo','Berna'), ('miguel','Migs'),
    ('enzo','Enzinho'), ('davi','Davizinho'), ('noah','Nô'),
    -- Femininos
    ('fernanda','Nanda'), ('juliana','Ju'), ('mariana','Mari'),
    ('camila','Cami'), ('isabela','Bela'), ('isabella','Bela'),
    ('patricia','Paty'), ('daniela','Dada'), ('rafaela','Rafinha'),
    ('gabriela','Gabi'), ('natalia','Nati'), ('amanda','Mandinha'),
    ('beatriz','Bia'), ('larissa','Lari'), ('vanessa','Nessa'),
    ('carolina','Carol'), ('caroline','Carol'), ('valentina','Tina'),
    ('helena','Lena'), ('alice','Lili'), ('laura','Lau'),
    ('manuela','Manu'), ('livia','Livi'), ('giovanna','Gigi'),
    ('sofia','Sô'), ('yasmin','Yas'), ('ana','Aninha'),
    ('julia','Juju'), ('bruna','Bru'), ('renata','Rê'),
    ('carla','Carlinha'), ('paula','Paulinha'), ('monica','Moni'),
    ('cristina','Cris'), ('luciana','Luci'), ('lucia','Lulu'),
    ('olivia','Olí'), ('kaue','Kauê'), ('valter','Val'),
    ('jorge','Jorginho'), ('renato','Renatinho'), ('marcio','Márcio'),
    ('flavio','Flavinho'), ('emerson','Emê'), ('alex','Xexéu'),
    ('rogerio','Rogê'), ('luiz','Lula'), ('victor','Vitão'),
    ('vitor','Vitão')
),
targets AS (
  SELECT
    up.user_id,
    up.name,
    -- normaliza primeiro nome: remove acentos, lower
    lower(translate(
      split_part(up.name, ' ', 1),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
    )) AS first_key
  FROM public.user_profiles up
  WHERE up.created_by_admin IS NOT NULL
    AND up.is_placeholder = false
)
UPDATE public.user_profiles up
SET nickname = m.nick
FROM targets t
JOIN map m ON m.first_key = t.first_key
WHERE up.user_id = t.user_id;

-- Para nomes sem mapeamento, usa o primeiro nome inteiro como apelido (sem números).
WITH leftovers AS (
  SELECT user_id, split_part(name, ' ', 1) AS first_part
  FROM public.user_profiles
  WHERE created_by_admin IS NOT NULL
    AND is_placeholder = false
    AND (nickname IS NULL OR nickname ~ '[0-9]')
)
UPDATE public.user_profiles up
SET nickname = l.first_part
FROM leftovers l
WHERE up.user_id = l.user_id
  AND length(l.first_part) >= 2;