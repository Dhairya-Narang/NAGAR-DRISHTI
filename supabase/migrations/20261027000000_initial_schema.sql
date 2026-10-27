-- ==========================================================
-- Nagar Drishti — PostgreSQL Database Schema
-- Compatible with Supabase PostgreSQL & Standard PostgreSQL 14+
-- ==========================================================

-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================================
-- 1. ENUM / TYPE DEFINITIONS
-- ==========================================================
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('citizen', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE complaint_status AS ENUM ('Pending', 'In Progress', 'Resolved', 'Reopened');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE complaint_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE verification_status AS ENUM ('unverified', 'pending_verification', 'verified', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==========================================================
-- 2. CORE USERS & AUTHENTICATION
-- ==========================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'citizen',
    phone VARCHAR(20),
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ==========================================================
-- 3. DEPARTMENTS
-- ==========================================================
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL UNIQUE,
    code VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 4. CITIZEN PROFILES (Option A - Specialized Citizen Data)
-- ==========================================================
CREATE TABLE IF NOT EXISTS citizen_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    address TEXT,
    ward VARCHAR(100),
    city VARCHAR(100) DEFAULT 'Delhi-NCR',
    pincode VARCHAR(20),
    preferred_language VARCHAR(20) DEFAULT 'en',
    notification_preferences JSONB DEFAULT '{"email": true, "sms": true, "whatsapp": false}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_citizen_profiles_user_id ON citizen_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_citizen_profiles_ward ON citizen_profiles(ward);

-- ==========================================================
-- 5. ADMIN PROFILES (Option A - Specialized Operations & Staff Data)
-- ==========================================================
CREATE TABLE IF NOT EXISTS admin_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    employee_id VARCHAR(100) UNIQUE,
    designation VARCHAR(150),
    is_superadmin BOOLEAN NOT NULL DEFAULT false,
    permissions JSONB DEFAULT '{"can_assign": true, "can_verify": true, "can_escalate": true, "ai_operations": true}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_profiles_user_id ON admin_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_profiles_department ON admin_profiles(department_id);

-- ==========================================================
-- 6. ISSUE CATEGORIES
-- ==========================================================
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL UNIQUE,
    slug VARCHAR(150) NOT NULL UNIQUE,
    description TEXT,
    default_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    default_priority complaint_priority DEFAULT 'medium',
    default_sla_hours INT DEFAULT 48,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 7. COMPLAINTS (Core Civic Reports)
-- ==========================================================
CREATE TABLE IF NOT EXISTS complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_number VARCHAR(50) UNIQUE NOT NULL, -- e.g. 'ND-2026-0001'
    reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    assigned_to_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Location details
    location_text TEXT NOT NULL,
    landmark VARCHAR(255),
    ward VARCHAR(100),
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    
    -- Status & Priority
    priority complaint_priority NOT NULL DEFAULT 'medium',
    status complaint_status NOT NULL DEFAULT 'Pending',
    verification_status verification_status NOT NULL DEFAULT 'unverified',
    
    -- SLA & Deadlines
    due_at TIMESTAMPTZ,
    is_escalated BOOLEAN NOT NULL DEFAULT false,
    escalation_reason TEXT,
    
    -- Resolution details
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    reopened_at TIMESTAMPTZ,
    reopening_reason TEXT,
    
    -- Related / Duplicate group tracking
    parent_incident_id UUID REFERENCES complaints(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_complaints_public_number ON complaints(public_number);
CREATE INDEX IF NOT EXISTS idx_complaints_reporter ON complaints(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_priority ON complaints(priority);
CREATE INDEX IF NOT EXISTS idx_complaints_department ON complaints(department_id);
CREATE INDEX IF NOT EXISTS idx_complaints_created_at ON complaints(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_due_at ON complaints(due_at) WHERE status IN ('Pending', 'In Progress');

-- ==========================================================
-- 8. ATTACHMENTS (Photos & Documents)
-- ==========================================================
CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    storage_key_or_url TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100),
    file_size_bytes BIGINT,
    attachment_kind VARCHAR(50) DEFAULT 'complaint_evidence', -- 'complaint_evidence', 'resolution_proof', 'reopening_proof'
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attachments_complaint ON attachments(complaint_id);

-- ==========================================================
-- 9. STATUS HISTORY (Immutable Lifecycle Audit Trail)
-- ==========================================================
CREATE TABLE IF NOT EXISTS status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    old_status complaint_status,
    new_status complaint_status NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    note TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_status_history_complaint ON status_history(complaint_id, timestamp ASC);

-- ==========================================================
-- 10. ACTIVITY LOG (System Audit & Admin Feed)
-- ==========================================================
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(255),
    action VARCHAR(100) NOT NULL, -- e.g. 'COMPLAINT_CREATED', 'DEPARTMENT_ASSIGNED', 'SLA_BREACHED'
    entity_type VARCHAR(50) NOT NULL, -- 'complaint', 'user', 'ai_suggestion'
    entity_id UUID,
    summary TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);

-- ==========================================================
-- 11. NOTIFICATIONS
-- ==========================================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    complaint_id UUID REFERENCES complaints(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'status_update', -- 'status_update', 'sla_warning', 'ai_recommendation', 'general'
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id, read_at);

-- ==========================================================
-- 12. AI REVIEW LOG (n8n AI Suggestions & Human Approvals)
-- ==========================================================
CREATE TABLE IF NOT EXISTS ai_review_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    workflow_name VARCHAR(100) NOT NULL, -- 'Workflow_A_Classification', 'Workflow_B_Duplicates', 'Workflow_D_Verification'
    suggestion_type VARCHAR(100) NOT NULL, -- 'category_suggestion', 'department_suggestion', 'priority_suggestion', 'duplicate_flag', 'verification_recommendation'
    suggestion_data JSONB NOT NULL,
    confidence_score NUMERIC(3, 2), -- 0.00 to 1.00
    reviewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    decision VARCHAR(50) DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'modified'
    feedback_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_review_log_complaint ON ai_review_log(complaint_id);
CREATE INDEX IF NOT EXISTS idx_ai_review_log_decision ON ai_review_log(decision);

-- ==========================================================
-- 13. SLA RULES
-- ==========================================================
CREATE TABLE IF NOT EXISTS sla_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    priority complaint_priority NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    response_target_hours INT NOT NULL, -- hours until complaint must be assigned/acknowledged
    resolution_target_hours INT NOT NULL, -- hours until complaint must be resolved
    escalation_threshold_hours INT NOT NULL, -- hours after which auto-escalation alert triggers
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 14. AUTOMATIC TIMESTAMP UPDATE TRIGGER
-- ==========================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ BEGIN
    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TRIGGER update_citizen_profiles_updated_at BEFORE UPDATE ON citizen_profiles FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TRIGGER update_admin_profiles_updated_at BEFORE UPDATE ON admin_profiles FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TRIGGER update_complaints_updated_at BEFORE UPDATE ON complaints FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
