-- ==========================================================
-- Nagar Drishti — Realistic Seed Data for Hackathon Demo
-- All UUIDs strictly use valid hexadecimal characters [0-9a-f]
-- ==========================================================

-- Clean existing data in reverse dependency order (safe re-run)
TRUNCATE TABLE ai_review_log, notifications, activity_log, status_history, attachments, complaints, sla_rules, categories, admin_profiles, citizen_profiles, departments, users CASCADE;

-- 1. DEPARTMENTS
INSERT INTO departments (id, name, code, description, contact_email, contact_phone, active) VALUES
('d1111111-1111-1111-1111-111111111111', 'Public Works Department (PWD)', 'PWD', 'Roads, bridges, pavements, and civil municipal infrastructure', 'pwd@nagardrishti.gov.in', '+91-11-23456701', true),
('d2222222-2222-2222-2222-222222222222', 'Solid Waste Management', 'SWM', 'Garbage collection, sanitation, landfills, and waste processing', 'swm@nagardrishti.gov.in', '+91-11-23456702', true),
('d3333333-3333-3333-3333-333333333333', 'Delhi Jal Board (Water & Sewage)', 'DJB', 'Potable water supply, pipeline maintenance, sewage and drains', 'jalboard@nagardrishti.gov.in', '+91-11-23456703', true),
('d4444444-4444-4444-4444-444444444444', 'Electricity & Power Distribution', 'EPD', 'Power grid, transformers, electrical safety, and street lighting', 'power@nagardrishti.gov.in', '+91-11-23456704', true),
('d5555555-5555-5555-5555-555555555555', 'Horticulture & Public Parks', 'HORT', 'Trees, public parks, pruning, and green verge maintenance', 'horticulture@nagardrishti.gov.in', '+91-11-23456705', true)
ON CONFLICT (id) DO NOTHING;

-- 2. CATEGORIES
INSERT INTO categories (id, name, slug, description, default_department_id, default_priority, default_sla_hours, active) VALUES
('c1111111-1111-1111-1111-111111111111', 'Road Damage & Potholes', 'road-damage-potholes', 'Potholes, surface erosion, damaged pavers, road sinkage', 'd1111111-1111-1111-1111-111111111111', 'high', 48, true),
('c2222222-2222-2222-2222-222222222222', 'Garbage & Waste Accumulation', 'garbage-waste', 'Overflowing community bins, illegal dumping, littering', 'd2222222-2222-2222-2222-222222222222', 'medium', 24, true),
('c3333333-3333-3333-3333-333333333333', 'Water Pipeline Leakage / Burst', 'water-leakage', 'Fresh water main leak, pipeline burst, flooding due to water supply', 'd3333333-3333-3333-3333-333333333333', 'urgent', 12, true),
('c4444444-4444-4444-4444-444444444444', 'Broken Streetlights', 'broken-streetlights', 'Dark streets, flickering or non-functional LED street lamps', 'd4444444-4444-4444-4444-444444444444', 'medium', 48, true),
('c5555555-5555-5555-5555-555555555555', 'Sewage Overflow & Blocked Drains', 'sewage-overflow', 'Clogged drains, manhole overflow, dirty sewage backup', 'd3333333-3333-3333-3333-333333333333', 'urgent', 18, true),
('c6666666-6666-6666-6666-666666666666', 'Fallen Trees & Obstructions', 'fallen-trees', 'Fallen tree or hanging dangerous branch obstructing transit', 'd5555555-5555-5555-5555-555555555555', 'high', 24, true)
ON CONFLICT (id) DO NOTHING;

-- 3. SLA RULES
INSERT INTO sla_rules (id, priority, response_target_hours, resolution_target_hours, escalation_threshold_hours, enabled) VALUES
('f1111111-1111-1111-1111-111111111111', 'urgent', 2, 12, 8, true),
('f2222222-2222-2222-2222-222222222222', 'high', 4, 24, 18, true),
('f3333333-3333-3333-3333-333333333333', 'medium', 12, 48, 36, true),
('f4444444-4444-4444-4444-444444444444', 'low', 24, 96, 72, true)
ON CONFLICT (id) DO NOTHING;

-- 4. USERS (Bcrypt passwords: Admin@1234 and Citizen@1234)
INSERT INTO users (id, name, email, password_hash, role, phone, is_active) VALUES
-- Superadmin
('e1111111-1111-1111-1111-111111111111', 'Rajesh Sharma', 'admin@nagardrishti.gov.in', '$2b$10$pX7QomZlaIPi9r4BLehb/uJS3pFn/7OSS41pSKPN76hgvUqRsN3P6', 'admin', '+91-9811001122', true),
-- PWD Admin / Department Head
('e2222222-2222-2222-2222-222222222222', 'Anita Verma', 'pwd.officer@nagardrishti.gov.in', '$2b$10$pX7QomZlaIPi9r4BLehb/uJS3pFn/7OSS41pSKPN76hgvUqRsN3P6', 'admin', '+91-9811002233', true),
-- Primary Citizen
('e3333333-3333-3333-3333-333333333333', 'Vikram Malhotra', 'citizen@example.com', '$2b$10$llNWhuvxXOh3zfner1WYre5U75ZEY.nh4rLo5I4DJ4o5fr1Yb/bNW', 'citizen', '+91-9871234567', true),
-- Second Citizen (for duplicate/related reporting)
('e4444444-4444-4444-4444-444444444444', 'Priya Sharma', 'priya.sharma@example.com', '$2b$10$llNWhuvxXOh3zfner1WYre5U75ZEY.nh4rLo5I4DJ4o5fr1Yb/bNW', 'citizen', '+91-9871239999', true)
ON CONFLICT (id) DO NOTHING;

-- 5. ADMIN PROFILES (Option A)
INSERT INTO admin_profiles (user_id, department_id, employee_id, designation, is_superadmin, permissions) VALUES
('e1111111-1111-1111-1111-111111111111', NULL, 'ND-ADM-001', 'Chief Municipal Commissioner', true, '{"can_assign": true, "can_verify": true, "can_escalate": true, "ai_operations": true, "can_manage_users": true}'::jsonb),
('e2222222-2222-2222-2222-222222222222', 'd1111111-1111-1111-1111-111111111111', 'ND-PWD-102', 'Executive Engineer (Roads)', false, '{"can_assign": true, "can_verify": true, "can_escalate": false, "ai_operations": false}'::jsonb)
ON CONFLICT (user_id) DO NOTHING;

-- 6. CITIZEN PROFILES (Option A)
INSERT INTO citizen_profiles (user_id, address, ward, city, pincode, preferred_language, notification_preferences) VALUES
('e3333333-3333-3333-3333-333333333333', 'Flat 402, Green Glen Heights, Sector 14', 'Ward 12', 'Delhi-NCR', '110025', 'en', '{"email": true, "sms": true, "whatsapp": true}'::jsonb),
('e4444444-4444-4444-4444-444444444444', 'House 22, Lane 4, Sector 14 Market Area', 'Ward 12', 'Delhi-NCR', '110025', 'hi', '{"email": true, "sms": true, "whatsapp": false}'::jsonb)
ON CONFLICT (user_id) DO NOTHING;

-- 7. COMPLAINTS (Hackathon Demo Scenarios)

-- Complaint 1: In Progress Pothole
INSERT INTO complaints (
    id, public_number, reporter_user_id, title, description,
    category_id, department_id, assigned_to_admin_id,
    location_text, landmark, ward, latitude, longitude,
    priority, status, verification_status,
    due_at, created_at
) VALUES (
    'a1111111-1111-1111-1111-111111111111', 'ND-2026-0001', 'e3333333-3333-3333-3333-333333333333',
    'Hazardous Pothole on Sector 14 Main Avenue',
    'A 2-foot deep pothole has formed in the middle of the road after recent rains. Multiple two-wheelers have skidded here. Immediate repair needed.',
    'c1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'e2222222-2222-2222-2222-222222222222',
    'Main Avenue opposite Mother Dairy, Sector 14', 'Opposite Mother Dairy booth #4', 'Ward 12', 28.5355160, 77.2510120,
    'high', 'In Progress', 'unverified',
    CURRENT_TIMESTAMP + INTERVAL '18 hours', CURRENT_TIMESTAMP - INTERVAL '6 hours'
) ON CONFLICT (id) DO NOTHING;

-- Complaint 2: Related / Potential Duplicate
INSERT INTO complaints (
    id, public_number, reporter_user_id, title, description,
    category_id, department_id,
    location_text, landmark, ward, latitude, longitude,
    priority, status, verification_status,
    due_at, created_at, parent_incident_id
) VALUES (
    'a2222222-2222-2222-2222-222222222222', 'ND-2026-0002', 'e4444444-4444-4444-4444-444444444444',
    'Huge crater near Sector 14 Mother Dairy road',
    'Road broken and crater formed on the main lane causing traffic congestion and accidents.',
    'c1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111',
    'Sector 14 Road near Mother Dairy', 'Mother Dairy junction', 'Ward 12', 28.5356000, 77.2511000,
    'high', 'Pending', 'unverified',
    CURRENT_TIMESTAMP + INTERVAL '24 hours', CURRENT_TIMESTAMP - INTERVAL '2 hours',
    'a1111111-1111-1111-1111-111111111111'
) ON CONFLICT (id) DO NOTHING;

-- Complaint 3: Urgent Water Leakage (Approaching SLA)
INSERT INTO complaints (
    id, public_number, reporter_user_id, title, description,
    category_id, department_id,
    location_text, landmark, ward, latitude, longitude,
    priority, status, verification_status,
    due_at, created_at
) VALUES (
    'a3333333-3333-3333-3333-333333333333', 'ND-2026-0003', 'e3333333-3333-3333-3333-333333333333',
    'Drinking Water Main Pipeline Burst gushing onto street',
    'Clean potable water gushing out onto the road since 6 AM. Thousands of liters of water wasted and low water pressure in nearby houses.',
    'c3333333-3333-3333-3333-333333333333', 'd3333333-3333-3333-3333-333333333333',
    'Block C intersection, Near Central Park Gate 2', 'Gate 2 Central Park', 'Ward 12', 28.5391000, 77.2543000,
    'urgent', 'Pending', 'unverified',
    CURRENT_TIMESTAMP + INTERVAL '2 hours', CURRENT_TIMESTAMP - INTERVAL '10 hours'
) ON CONFLICT (id) DO NOTHING;

-- Complaint 4: Resolved with Verification Pending
INSERT INTO complaints (
    id, public_number, reporter_user_id, title, description,
    category_id, department_id, assigned_to_admin_id,
    location_text, landmark, ward, latitude, longitude,
    priority, status, verification_status,
    resolved_at, resolution_notes, created_at
) VALUES (
    'a4444444-4444-4444-4444-444444444444', 'ND-2026-0004', 'e3333333-3333-3333-3333-333333333333',
    'Overflowing community garbage dumpster near Market',
    'Garbage overflowing onto pedestrian walkway, emitting severe foul odor and attracting stray dogs.',
    'c2222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222222', 'e1111111-1111-1111-1111-111111111111',
    'Corner of Market Road, Sector 14', 'Behind Subzi Mandi', 'Ward 12', 28.5367000, 77.2525000,
    'medium', 'Resolved', 'pending_verification',
    CURRENT_TIMESTAMP - INTERVAL '1 hour', 'Sanitation truck #8 deployed. Bin cleared and bleaching powder sprinkled.',
    CURRENT_TIMESTAMP - INTERVAL '2 days'
) ON CONFLICT (id) DO NOTHING;

-- 8. STATUS HISTORY
INSERT INTO status_history (complaint_id, old_status, new_status, changed_by, note, timestamp) VALUES
('a1111111-1111-1111-1111-111111111111', NULL, 'Pending', 'e3333333-3333-3333-3333-333333333333', 'Complaint logged by citizen', CURRENT_TIMESTAMP - INTERVAL '6 hours'),
('a1111111-1111-1111-1111-111111111111', 'Pending', 'In Progress', 'e1111111-1111-1111-1111-111111111111', 'Assigned to PWD Executive Engineer Anita Verma with High priority', CURRENT_TIMESTAMP - INTERVAL '4 hours'),
('a2222222-2222-2222-2222-222222222222', NULL, 'Pending', 'e4444444-4444-4444-4444-444444444444', 'Complaint logged by citizen', CURRENT_TIMESTAMP - INTERVAL '2 hours'),
('a3333333-3333-3333-3333-333333333333', NULL, 'Pending', 'e3333333-3333-3333-3333-333333333333', 'Complaint logged by citizen as urgent water emergency', CURRENT_TIMESTAMP - INTERVAL '10 hours'),
('a4444444-4444-4444-4444-444444444444', NULL, 'Pending', 'e3333333-3333-3333-3333-333333333333', 'Complaint logged by citizen', CURRENT_TIMESTAMP - INTERVAL '2 days'),
('a4444444-4444-4444-4444-444444444444', 'Pending', 'In Progress', 'e1111111-1111-1111-1111-111111111111', 'Assigned to SWM sanitation team', CURRENT_TIMESTAMP - INTERVAL '1 day'),
('a4444444-4444-4444-4444-444444444444', 'In Progress', 'Resolved', 'e1111111-1111-1111-1111-111111111111', 'Marked resolved by sanitation supervisor. Sent to verification queue.', CURRENT_TIMESTAMP - INTERVAL '1 hour');

-- 9. AI REVIEW LOG (Simulated n8n Suggestions for Demo)
INSERT INTO ai_review_log (
    complaint_id, workflow_name, suggestion_type,
    suggestion_data, confidence_score, decision, created_at
) VALUES
(
    'a1111111-1111-1111-1111-111111111111', 'Workflow_A_Classification', 'department_suggestion',
    '{"suggested_department": "PWD", "suggested_priority": "high", "reasoning": "High-risk road crater on primary avenue causing vehicular hazards."}'::jsonb,
    0.96, 'accepted', CURRENT_TIMESTAMP - INTERVAL '5 hours'
),
(
    'a2222222-2222-2222-2222-222222222222', 'Workflow_B_Duplicates', 'duplicate_flag',
    '{"potential_duplicate_of": "ND-2026-0001", "similarity_score": 0.89, "matching_factors": ["Same locality (Sector 14 Mother Dairy)", "Identical road pothole defect within 15 meters"]}'::jsonb,
    0.89, 'pending', CURRENT_TIMESTAMP - INTERVAL '1 hour 50 minutes'
);

-- 10. NOTIFICATIONS
INSERT INTO notifications (recipient_user_id, complaint_id, title, message, type, read_at, created_at) VALUES
('e3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111', 'Complaint ND-2026-0001 In Progress', 'Your complaint regarding Pothole on Sector 14 Main Avenue has been assigned to PWD.', 'status_update', CURRENT_TIMESTAMP - INTERVAL '3 hours', CURRENT_TIMESTAMP - INTERVAL '4 hours'),
('e3333333-3333-3333-3333-333333333333', 'a4444444-4444-4444-4444-444444444444', 'Complaint ND-2026-0004 Resolved', 'Sanitation team reported garbage bin cleared. Please verify resolution.', 'status_update', NULL, CURRENT_TIMESTAMP - INTERVAL '1 hour');

-- 11. ACTIVITY LOG
INSERT INTO activity_log (actor_id, actor_name, action, entity_type, entity_id, summary, metadata) VALUES
('e3333333-3333-3333-3333-333333333333', 'Vikram Malhotra', 'COMPLAINT_CREATED', 'complaint', 'a1111111-1111-1111-1111-111111111111', 'Submitted complaint ND-2026-0001: Pothole on Sector 14 Main Avenue', '{"category": "Road Damage"}'::jsonb),
('e1111111-1111-1111-1111-111111111111', 'Rajesh Sharma', 'DEPARTMENT_ASSIGNED', 'complaint', 'a1111111-1111-1111-1111-111111111111', 'Assigned ND-2026-0001 to PWD', '{"department_code": "PWD"}'::jsonb),
('e4444444-4444-4444-4444-444444444444', 'Priya Sharma', 'COMPLAINT_CREATED', 'complaint', 'a2222222-2222-2222-2222-222222222222', 'Submitted complaint ND-2026-0002: Crater near Mother Dairy', '{"category": "Road Damage"}'::jsonb),
('e1111111-1111-1111-1111-111111111111', 'Rajesh Sharma', 'COMPLAINT_RESOLVED', 'complaint', 'a4444444-4444-4444-4444-444444444444', 'Marked ND-2026-0004 as Resolved pending verification', '{"verification": "pending"}'::jsonb);
