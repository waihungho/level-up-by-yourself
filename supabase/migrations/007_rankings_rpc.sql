-- =============================================
-- Migration 007: rankings computed inside Postgres.
-- /api/rank used to page all 55k+ agent_dimensions rows into the server and sum
-- them in JS (5-7s uncached). This returns the same payload in one query.
-- Safe to apply before or after deploying: the app falls back when it is missing.
-- =============================================

CREATE OR REPLACE FUNCTION levelup_rankings(p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH cat_dims AS (
    SELECT category, count(*) AS n_dims FROM levelup_dimensions GROUP BY category
  ),
  sums AS (
    SELECT ad.agent_id, d.category, sum(ad.value) AS sum_v, count(*) AS n
    FROM levelup_agent_dimensions ad
    JOIN levelup_dimensions d ON d.id = ad.dimension_id
    GROUP BY ad.agent_id, d.category
  ),
  per_cat AS (
    -- Missing dimension rows count as the base value 10, matching the app.
    SELECT a.id AS agent_id, c.category, c.n_dims,
           COALESCE(s.sum_v, 0) + 10 * (c.n_dims - COALESCE(s.n, 0)) AS cat_total
    FROM levelup_agents a
    CROSS JOIN cat_dims c
    LEFT JOIN sums s ON s.agent_id = a.id AND s.category = c.category
  ),
  scored AS (
    SELECT agent_id,
           sum(cat_total) AS total,
           (array_agg(category ORDER BY cat_total / n_dims DESC,
                      array_position(ARRAY['Physical','Mental','Social','Spiritual','Technical'], category)))[1] AS top_category
    FROM per_cat
    GROUP BY agent_id
  ),
  top AS (
    SELECT agent_id, total, top_category,
           row_number() OVER (ORDER BY total DESC, agent_id) AS rank
    FROM scored
    ORDER BY total DESC, agent_id
    LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'totalPlayers', (SELECT count(*) FROM levelup_players),
    'totalAgents', (SELECT count(*) FROM levelup_agents),
    'top', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'playerId', a.player_id,
        'name', a.name,
        'role', a.role,
        'spriteSeed', a.sprite_seed,
        'totalAbility', t.total::float8,
        'topCategory', t.top_category,
        'wallet', p.wallet_address,
        'pvp', jsonb_build_object('agentId', a.id, 'wins', COALESCE(ps.wins, 0), 'losses', COALESCE(ps.losses, 0))
      ) ORDER BY t.rank)
      FROM top t
      JOIN levelup_agents a ON a.id = t.agent_id
      LEFT JOIN levelup_players p ON p.id = a.player_id
      LEFT JOIN levelup_pvp_stats ps ON ps.agent_id = a.id
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION levelup_rankings(int) TO anon, authenticated, service_role;
