-- PostgreSQL Schema for Collaborative Task Management Platform

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in-progress', 'done')),
    assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Approval requests table (for task creation and deletion)
CREATE TABLE IF NOT EXISTS approval_requests (
    id SERIAL PRIMARY KEY,
    request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('create', 'delete')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    -- For 'create' requests: store proposed task details
    task_title VARCHAR(200),
    task_description TEXT,
    task_assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    -- For 'delete' requests: reference existing task
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    requested_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for search functionality
CREATE INDEX IF NOT EXISTS idx_tasks_title ON tasks USING GIN (to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks (assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_requests (status);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

-- Insert a default admin user (password: admin123)
-- bcrypt hash for 'admin123' — verified with bcrypt.compareSync
-- ON CONFLICT: always enforce correct role and password for the admin account
INSERT INTO users (username, email, password_hash, role)
VALUES ('admin', 'admin@taskmanager.com', '$2a$10$eoh3V4gU/4oByoK.RSPosOI/a28c7rO1F09dQOTtmQVNYpDY8BR5m', 'admin')
ON CONFLICT (username) DO UPDATE SET
  role = 'admin',
  password_hash = EXCLUDED.password_hash,
  email = EXCLUDED.email;
