-- Woontegra backend - örnek veritabanı şeması (PostgreSQL uyumlu)
-- Gerçek kurulumda Prisma/TypeORM veya raw SQL ile kullanılabilir.

-- roles
CREATE TABLE IF NOT EXISTS roles (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE
);

-- users
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_id       UUID REFERENCES roles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- user_profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id   UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(255),
  phone     VARCHAR(50)
);

-- contacts (iletişim formu)
CREATE TABLE IF NOT EXISTS contacts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255) NOT NULL,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- quote_requests (teklif talepleri)
CREATE TABLE IF NOT EXISTS quote_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  project_type  VARCHAR(100),
  service       VARCHAR(100),
  brief         TEXT,
  contact_name  VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(50),
  status        VARCHAR(50) DEFAULT 'pending',
  admin_notes   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- projects
CREATE TABLE IF NOT EXISTS projects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id),
  title      VARCHAR(255) NOT NULL,
  status     VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- support_tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id),
  subject    VARCHAR(255) NOT NULL,
  status     VARCHAR(50) DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ticket_messages
CREATE TABLE IF NOT EXISTS ticket_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id),
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- blog_categories
CREATE TABLE IF NOT EXISTS blog_categories (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL
);

-- blog_posts
CREATE TABLE IF NOT EXISTS blog_posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES blog_categories(id),
  slug        VARCHAR(255) NOT NULL UNIQUE,
  title       VARCHAR(255) NOT NULL,
  excerpt     TEXT,
  body        TEXT,
  status      VARCHAR(50) DEFAULT 'draft',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- notifications
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(255) NOT NULL,
  read       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- settings (key-value)
CREATE TABLE IF NOT EXISTS settings (
  key   VARCHAR(100) PRIMARY KEY,
  value TEXT
);

-- activity_logs (opsiyonel)
CREATE TABLE IF NOT EXISTS activity_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id),
  action     VARCHAR(100),
  entity     VARCHAR(100),
  entity_id  UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
