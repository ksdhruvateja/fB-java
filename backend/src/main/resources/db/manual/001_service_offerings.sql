-- Additive Neon / Postgres DDL for service catalog.
-- Flyway is disabled; run this once against Neon when deploying the Spring catalog.
-- Safe to re-run: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS service_offerings (
  id                       VARCHAR(64) PRIMARY KEY,
  slug                     VARCHAR(64) NOT NULL UNIQUE,
  name                     VARCHAR(120) NOT NULL,
  description              VARCHAR(512) NOT NULL,
  icon_key                 VARCHAR(64),
  one_time_professional    BOOLEAN NOT NULL DEFAULT TRUE,
  diy_eligible             BOOLEAN NOT NULL DEFAULT TRUE,
  ai_assessment_eligible   BOOLEAN NOT NULL DEFAULT TRUE,
  subscription_eligible    BOOLEAN NOT NULL DEFAULT FALSE,
  emergency_eligible       BOOLEAN NOT NULL DEFAULT FALSE,
  active                   BOOLEAN NOT NULL DEFAULT TRUE,
  homeowner_visible        BOOLEAN NOT NULL DEFAULT TRUE,
  pricing_metadata         JSONB,
  sort_order               INT NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_service_offerings_visible
  ON service_offerings (active, homeowner_visible, sort_order);

CREATE INDEX IF NOT EXISTS idx_service_offerings_sort
  ON service_offerings (sort_order, name);
