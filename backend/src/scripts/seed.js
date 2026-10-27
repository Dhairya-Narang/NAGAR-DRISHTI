import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
if (!env.SUPABASE_URL || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env');
  process.exit(1);
}

const supabase = createClient(env.SUPABASE_URL, supabaseKey, {
  auth: { persistSession: false }
});

async function seed() {
  console.log('🚀 Starting Supabase cloud database seeding for Nagar Drishti...');

  // 1. Departments (prefix 'd')
  console.log('1️⃣ Seeding departments...');
  const departments = [
    {
      id: 'd1111111-1111-1111-1111-111111111111',
      name: 'Public Works Department (PWD)',
      code: 'PWD',
      description: 'Roads, bridges, pavements, and civil municipal infrastructure',
      contact_email: 'pwd@nagardrishti.gov.in',
      contact_phone: '+91-11-23456701',
      active: true
    },
    {
      id: 'd2222222-2222-2222-2222-222222222222',
      name: 'Solid Waste Management',
      code: 'SWM',
      description: 'Garbage collection, sanitation, landfills, and waste processing',
      contact_email: 'swm@nagardrishti.gov.in',
      contact_phone: '+91-11-23456702',
      active: true
    },
    {
      id: 'd3333333-3333-3333-3333-333333333333',
      name: 'Delhi Jal Board (Water & Sewage)',
      code: 'DJB',
      description: 'Potable water supply, pipeline maintenance, sewage and drains',
      contact_email: 'jalboard@nagardrishti.gov.in',
      contact_phone: '+91-11-23456703',
      active: true
    },
    {
      id: 'd4444444-4444-4444-4444-444444444444',
      name: 'Electricity & Power Distribution',
      code: 'EPD',
      description: 'Power grid, transformers, electrical safety, and street lighting',
      contact_email: 'power@nagardrishti.gov.in',
      contact_phone: '+91-11-23456704',
      active: true
    },
    {
      id: 'd5555555-5555-5555-5555-555555555555',
      name: 'Horticulture & Public Parks',
      code: 'HORT',
      description: 'Trees, public parks, pruning, and green verge maintenance',
      contact_email: 'horticulture@nagardrishti.gov.in',
      contact_phone: '+91-11-23456705',
      active: true
    }
  ];
  const { error: deptErr } = await supabase.from('departments').upsert(departments, { onConflict: 'id' });
  if (deptErr) throw deptErr;
  console.log(`   ✅ Seeded ${departments.length} departments.`);

  // 2. Categories (prefix 'c')
  console.log('2️⃣ Seeding categories...');
  const categories = [
    {
      id: 'c1111111-1111-1111-1111-111111111111',
      name: 'Road Damage & Potholes',
      slug: 'road-damage-potholes',
      description: 'Potholes, surface erosion, damaged pavers, road sinkage',
      default_department_id: 'd1111111-1111-1111-1111-111111111111',
      default_priority: 'high',
      default_sla_hours: 48,
      active: true
    },
    {
      id: 'c2222222-2222-2222-2222-222222222222',
      name: 'Garbage & Waste Accumulation',
      slug: 'garbage-waste',
      description: 'Overflowing community bins, illegal dumping, littering',
      default_department_id: 'd2222222-2222-2222-2222-222222222222',
      default_priority: 'medium',
      default_sla_hours: 24,
      active: true
    },
    {
      id: 'c3333333-3333-3333-3333-333333333333',
      name: 'Water Pipeline Leakage / Burst',
      slug: 'water-leakage',
      description: 'Fresh water main leak, pipeline burst, flooding due to water supply',
      default_department_id: 'd3333333-3333-3333-3333-333333333333',
      default_priority: 'urgent',
      default_sla_hours: 12,
      active: true
    },
    {
      id: 'c4444444-4444-4444-4444-444444444444',
      name: 'Broken Streetlights',
      slug: 'broken-streetlights',
      description: 'Dark streets, flickering or non-functional LED street lamps',
      default_department_id: 'd4444444-4444-4444-4444-444444444444',
      default_priority: 'medium',
      default_sla_hours: 48,
      active: true
    },
    {
      id: 'c5555555-5555-5555-5555-555555555555',
      name: 'Sewage Overflow & Blocked Drains',
      slug: 'sewage-overflow',
      description: 'Clogged drains, manhole overflow, dirty sewage backup',
      default_department_id: 'd3333333-3333-3333-3333-333333333333',
      default_priority: 'urgent',
      default_sla_hours: 18,
      active: true
    },
    {
      id: 'c6666666-6666-6666-6666-666666666666',
      name: 'Fallen Trees & Obstructions',
      slug: 'fallen-trees',
      description: 'Fallen tree or hanging dangerous branch obstructing transit',
      default_department_id: 'd5555555-5555-5555-5555-555555555555',
      default_priority: 'high',
      default_sla_hours: 24,
      active: true
    }
  ];
  const { error: catErr } = await supabase.from('categories').upsert(categories, { onConflict: 'id' });
  if (catErr) throw catErr;
  console.log(`   ✅ Seeded ${categories.length} categories.`);

  // 3. SLA Rules (prefix 'f')
  console.log('3️⃣ Seeding SLA rules...');
  const slaRules = [
    { id: 'f1111111-1111-1111-1111-111111111111', priority: 'urgent', response_target_hours: 2, resolution_target_hours: 12, escalation_threshold_hours: 8, enabled: true },
    { id: 'f2222222-2222-2222-2222-222222222222', priority: 'high', response_target_hours: 4, resolution_target_hours: 24, escalation_threshold_hours: 18, enabled: true },
    { id: 'f3333333-3333-3333-3333-333333333333', priority: 'medium', response_target_hours: 12, resolution_target_hours: 48, escalation_threshold_hours: 36, enabled: true },
    { id: 'f4444444-4444-4444-4444-444444444444', priority: 'low', response_target_hours: 24, resolution_target_hours: 96, escalation_threshold_hours: 72, enabled: true }
  ];
  const { error: slaErr } = await supabase.from('sla_rules').upsert(slaRules, { onConflict: 'id' });
  if (slaErr) throw slaErr;
  console.log(`   ✅ Seeded ${slaRules.length} SLA rules.`);

  // 4. Users (prefix 'e') (Passwords: Admin@1234 and Citizen@1234)
  console.log('4️⃣ Seeding users...');
  const users = [
    {
      id: 'e1111111-1111-1111-1111-111111111111',
      name: 'Rajesh Sharma',
      email: 'admin@nagardrishti.gov.in',
      password_hash: '$2b$10$pX7QomZlaIPi9r4BLehb/uJS3pFn/7OSS41pSKPN76hgvUqRsN3P6',
      role: 'admin',
      phone: '+91-9811001122',
      is_active: true
    },
    {
      id: 'e2222222-2222-2222-2222-222222222222',
      name: 'Anita Verma',
      email: 'pwd.officer@nagardrishti.gov.in',
      password_hash: '$2b$10$pX7QomZlaIPi9r4BLehb/uJS3pFn/7OSS41pSKPN76hgvUqRsN3P6',
      role: 'admin',
      phone: '+91-9811002233',
      is_active: true
    },
    {
      id: 'e3333333-3333-3333-3333-333333333333',
      name: 'Vikram Malhotra',
      email: 'citizen@example.com',
      password_hash: '$2b$10$llNWhuvxXOh3zfner1WYre5U75ZEY.nh4rLo5I4DJ4o5fr1Yb/bNW',
      role: 'citizen',
      phone: '+91-9871234567',
      is_active: true
    },
    {
      id: 'e4444444-4444-4444-4444-444444444444',
      name: 'Priya Sharma',
      email: 'priya.sharma@example.com',
      password_hash: '$2b$10$llNWhuvxXOh3zfner1WYre5U75ZEY.nh4rLo5I4DJ4o5fr1Yb/bNW',
      role: 'citizen',
      phone: '+91-9871239999',
      is_active: true
    }
  ];
  const { error: userErr } = await supabase.from('users').upsert(users, { onConflict: 'id' });
  if (userErr) throw userErr;
  console.log(`   ✅ Seeded ${users.length} users.`);

  // 5. Admin Profiles
  console.log('5️⃣ Seeding admin profiles...');
  const adminProfiles = [
    {
      user_id: 'e1111111-1111-1111-1111-111111111111',
      department_id: null,
      employee_id: 'ND-ADM-001',
      designation: 'Chief Municipal Commissioner',
      is_superadmin: true,
      permissions: { can_assign: true, can_verify: true, can_escalate: true, ai_operations: true, can_manage_users: true }
    },
    {
      user_id: 'e2222222-2222-2222-2222-222222222222',
      department_id: 'd1111111-1111-1111-1111-111111111111',
      employee_id: 'ND-PWD-102',
      designation: 'Executive Engineer (Roads)',
      is_superadmin: false,
      permissions: { can_assign: true, can_verify: true, can_escalate: false, ai_operations: false }
    }
  ];
  const { error: adminErr } = await supabase.from('admin_profiles').upsert(adminProfiles, { onConflict: 'user_id' });
  if (adminErr) throw adminErr;
  console.log(`   ✅ Seeded ${adminProfiles.length} admin profiles.`);

  // 6. Citizen Profiles
  console.log('6️⃣ Seeding citizen profiles...');
  const citizenProfiles = [
    {
      user_id: 'e3333333-3333-3333-3333-333333333333',
      address: 'Flat 402, Green Glen Heights, Sector 14',
      ward: 'Ward 12',
      city: 'Delhi-NCR',
      pincode: '110025',
      preferred_language: 'en',
      notification_preferences: { email: true, sms: true, whatsapp: true }
    },
    {
      user_id: 'e4444444-4444-4444-4444-444444444444',
      address: 'House 22, Lane 4, Sector 14 Market Area',
      ward: 'Ward 12',
      city: 'Delhi-NCR',
      pincode: '110025',
      preferred_language: 'hi',
      notification_preferences: { email: true, sms: true, whatsapp: false }
    }
  ];
  const { error: citErr } = await supabase.from('citizen_profiles').upsert(citizenProfiles, { onConflict: 'user_id' });
  if (citErr) throw citErr;
  console.log(`   ✅ Seeded ${citizenProfiles.length} citizen profiles.`);

  // 7. Complaints (prefix 'a')
  console.log('7️⃣ Seeding complaints...');
  const now = new Date();
  const complaints = [
    {
      id: 'a1111111-1111-1111-1111-111111111111',
      public_number: 'ND-2026-0001',
      reporter_user_id: 'e3333333-3333-3333-3333-333333333333',
      title: 'Hazardous Pothole on Sector 14 Main Avenue',
      description: 'A 2-foot deep pothole has formed in the middle of the road after recent rains. Multiple two-wheelers have skidded here. Immediate repair needed.',
      category_id: 'c1111111-1111-1111-1111-111111111111',
      department_id: 'd1111111-1111-1111-1111-111111111111',
      assigned_to_admin_id: 'e2222222-2222-2222-2222-222222222222',
      location_text: 'Main Avenue opposite Mother Dairy, Sector 14',
      landmark: 'Opposite Mother Dairy booth #4',
      ward: 'Ward 12',
      latitude: 28.5355160,
      longitude: 77.2510120,
      priority: 'high',
      status: 'In Progress',
      verification_status: 'unverified',
      due_at: new Date(now.getTime() + 18 * 3600 * 1000).toISOString(),
      created_at: new Date(now.getTime() - 6 * 3600 * 1000).toISOString()
    },
    {
      id: 'a2222222-2222-2222-2222-222222222222',
      public_number: 'ND-2026-0002',
      reporter_user_id: 'e4444444-4444-4444-4444-444444444444',
      title: 'Huge crater near Sector 14 Mother Dairy road',
      description: 'Road broken and crater formed on the main lane causing traffic congestion and accidents.',
      category_id: 'c1111111-1111-1111-1111-111111111111',
      department_id: 'd1111111-1111-1111-1111-111111111111',
      assigned_to_admin_id: null,
      location_text: 'Sector 14 Road near Mother Dairy',
      landmark: 'Mother Dairy junction',
      ward: 'Ward 12',
      latitude: 28.5356000,
      longitude: 77.2511000,
      priority: 'high',
      status: 'Pending',
      verification_status: 'unverified',
      due_at: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
      created_at: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
      parent_incident_id: 'a1111111-1111-1111-1111-111111111111'
    },
    {
      id: 'a3333333-3333-3333-3333-333333333333',
      public_number: 'ND-2026-0003',
      reporter_user_id: 'e3333333-3333-3333-3333-333333333333',
      title: 'Drinking Water Main Pipeline Burst gushing onto street',
      description: 'Clean potable water gushing out onto the road since 6 AM. Thousands of liters of water wasted and low water pressure in nearby houses.',
      category_id: 'c3333333-3333-3333-3333-333333333333',
      department_id: 'd3333333-3333-3333-3333-333333333333',
      assigned_to_admin_id: null,
      location_text: 'Block C intersection, Near Central Park Gate 2',
      landmark: 'Gate 2 Central Park',
      ward: 'Ward 12',
      latitude: 28.5391000,
      longitude: 77.2543000,
      priority: 'urgent',
      status: 'Pending',
      verification_status: 'unverified',
      due_at: new Date(now.getTime() + 2 * 3600 * 1000).toISOString(),
      created_at: new Date(now.getTime() - 10 * 3600 * 1000).toISOString()
    },
    {
      id: 'a4444444-4444-4444-4444-444444444444',
      public_number: 'ND-2026-0004',
      reporter_user_id: 'e3333333-3333-3333-3333-333333333333',
      title: 'Overflowing community garbage dumpster near Market',
      description: 'Garbage overflowing onto pedestrian walkway, emitting severe foul odor and attracting stray dogs.',
      category_id: 'c2222222-2222-2222-2222-222222222222',
      department_id: 'd2222222-2222-2222-2222-222222222222',
      assigned_to_admin_id: 'e1111111-1111-1111-1111-111111111111',
      location_text: 'Corner of Market Road, Sector 14',
      landmark: 'Behind Subzi Mandi',
      ward: 'Ward 12',
      latitude: 28.5367000,
      longitude: 77.2525000,
      priority: 'medium',
      status: 'Resolved',
      verification_status: 'pending_verification',
      resolved_at: new Date(now.getTime() - 3600 * 1000).toISOString(),
      resolution_notes: 'Sanitation truck #8 deployed. Bin cleared and bleaching powder sprinkled.',
      created_at: new Date(now.getTime() - 48 * 3600 * 1000).toISOString()
    }
  ];
  const { error: compErr } = await supabase.from('complaints').upsert(complaints, { onConflict: 'id' });
  if (compErr) throw compErr;
  console.log(`   ✅ Seeded ${complaints.length} complaints.`);

  // 8. Status History
  console.log('8️⃣ Seeding status history...');
  const statusHistory = [
    { complaint_id: 'a1111111-1111-1111-1111-111111111111', old_status: null, new_status: 'Pending', changed_by: 'e3333333-3333-3333-3333-333333333333', note: 'Complaint logged by citizen', timestamp: new Date(now.getTime() - 6 * 3600 * 1000).toISOString() },
    { complaint_id: 'a1111111-1111-1111-1111-111111111111', old_status: 'Pending', new_status: 'In Progress', changed_by: 'e1111111-1111-1111-1111-111111111111', note: 'Assigned to PWD Executive Engineer Anita Verma with High priority', timestamp: new Date(now.getTime() - 4 * 3600 * 1000).toISOString() },
    { complaint_id: 'a2222222-2222-2222-2222-222222222222', old_status: null, new_status: 'Pending', changed_by: 'e4444444-4444-4444-4444-444444444444', note: 'Complaint logged by citizen', timestamp: new Date(now.getTime() - 2 * 3600 * 1000).toISOString() },
    { complaint_id: 'a3333333-3333-3333-3333-333333333333', old_status: null, new_status: 'Pending', changed_by: 'e3333333-3333-3333-3333-333333333333', note: 'Complaint logged by citizen as urgent water emergency', timestamp: new Date(now.getTime() - 10 * 3600 * 1000).toISOString() },
    { complaint_id: 'a4444444-4444-4444-4444-444444444444', old_status: null, new_status: 'Pending', changed_by: 'e3333333-3333-3333-3333-333333333333', note: 'Complaint logged by citizen', timestamp: new Date(now.getTime() - 48 * 3600 * 1000).toISOString() },
    { complaint_id: 'a4444444-4444-4444-4444-444444444444', old_status: 'Pending', new_status: 'In Progress', changed_by: 'e1111111-1111-1111-1111-111111111111', note: 'Assigned to SWM sanitation team', timestamp: new Date(now.getTime() - 24 * 3600 * 1000).toISOString() },
    { complaint_id: 'a4444444-4444-4444-4444-444444444444', old_status: 'In Progress', new_status: 'Resolved', changed_by: 'e1111111-1111-1111-1111-111111111111', note: 'Marked resolved by sanitation supervisor. Sent to verification queue.', timestamp: new Date(now.getTime() - 3600 * 1000).toISOString() }
  ];
  const { error: histErr } = await supabase.from('status_history').insert(statusHistory);
  if (histErr) console.warn('   ⚠️ Status history insert warning:', histErr.message);
  else console.log(`   ✅ Seeded ${statusHistory.length} status history records.`);

  // 9. AI Review Log
  console.log('9️⃣ Seeding AI review log...');
  const aiLogs = [
    {
      complaint_id: 'a1111111-1111-1111-1111-111111111111',
      workflow_name: 'Workflow_A_Classification',
      suggestion_type: 'department_suggestion',
      suggestion_data: { suggested_department: 'PWD', suggested_priority: 'high', reasoning: 'High-risk road crater on primary avenue causing vehicular hazards.' },
      confidence_score: 0.96,
      decision: 'accepted',
      created_at: new Date(now.getTime() - 5 * 3600 * 1000).toISOString()
    },
    {
      complaint_id: 'a2222222-2222-2222-2222-222222222222',
      workflow_name: 'Workflow_B_Duplicates',
      suggestion_type: 'duplicate_flag',
      suggestion_data: { potential_duplicate_of: 'ND-2026-0001', similarity_score: 0.89, matching_factors: ['Same locality (Sector 14 Mother Dairy)', 'Identical road pothole defect within 15 meters'] },
      confidence_score: 0.89,
      decision: 'pending',
      created_at: new Date(now.getTime() - 110 * 60 * 1000).toISOString()
    }
  ];
  const { error: aiErr } = await supabase.from('ai_review_log').insert(aiLogs);
  if (aiErr) console.warn('   ⚠️ AI review log insert warning:', aiErr.message);
  else console.log(`   ✅ Seeded ${aiLogs.length} AI review records.`);

  // 10. Notifications
  console.log('🔟 Seeding notifications...');
  const notifications = [
    {
      recipient_user_id: 'e3333333-3333-3333-3333-333333333333',
      complaint_id: 'a1111111-1111-1111-1111-111111111111',
      title: 'Complaint ND-2026-0001 In Progress',
      message: 'Your complaint regarding Pothole on Sector 14 Main Avenue has been assigned to PWD.',
      type: 'status_update',
      read_at: new Date(now.getTime() - 3 * 3600 * 1000).toISOString(),
      created_at: new Date(now.getTime() - 4 * 3600 * 1000).toISOString()
    },
    {
      recipient_user_id: 'e3333333-3333-3333-3333-333333333333',
      complaint_id: 'a4444444-4444-4444-4444-444444444444',
      title: 'Complaint ND-2026-0004 Resolved',
      message: 'Sanitation team reported garbage bin cleared. Please verify resolution.',
      type: 'status_update',
      read_at: null,
      created_at: new Date(now.getTime() - 3600 * 1000).toISOString()
    }
  ];
  const { error: notifErr } = await supabase.from('notifications').insert(notifications);
  if (notifErr) console.warn('   ⚠️ Notifications insert warning:', notifErr.message);
  else console.log(`   ✅ Seeded ${notifications.length} notifications.`);

  // 11. Activity Log
  console.log('1️⃣1️⃣ Seeding activity log...');
  const activityLogs = [
    { actor_id: 'e3333333-3333-3333-3333-333333333333', actor_name: 'Vikram Malhotra', action: 'COMPLAINT_CREATED', entity_type: 'complaint', entity_id: 'a1111111-1111-1111-1111-111111111111', summary: 'Submitted complaint ND-2026-0001: Pothole on Sector 14 Main Avenue', metadata: { category: 'Road Damage' } },
    { actor_id: 'e1111111-1111-1111-1111-111111111111', actor_name: 'Rajesh Sharma', action: 'DEPARTMENT_ASSIGNED', entity_type: 'complaint', entity_id: 'a1111111-1111-1111-1111-111111111111', summary: 'Assigned ND-2026-0001 to PWD', metadata: { department_code: 'PWD' } },
    { actor_id: 'e4444444-4444-4444-4444-444444444444', actor_name: 'Priya Sharma', action: 'COMPLAINT_CREATED', entity_type: 'complaint', entity_id: 'a2222222-2222-2222-2222-222222222222', summary: 'Submitted complaint ND-2026-0002: Crater near Mother Dairy', metadata: { category: 'Road Damage' } },
    { actor_id: 'e1111111-1111-1111-1111-111111111111', actor_name: 'Rajesh Sharma', action: 'COMPLAINT_RESOLVED', entity_type: 'complaint', entity_id: 'a4444444-4444-4444-4444-444444444444', summary: 'Marked ND-2026-0004 as Resolved pending verification', metadata: { verification: 'pending' } }
  ];
  const { error: actErr } = await supabase.from('activity_log').insert(activityLogs);
  if (actErr) console.warn('   ⚠️ Activity log insert warning:', actErr.message);
  else console.log(`   ✅ Seeded ${activityLogs.length} activity records.`);

  console.log('\n🎉 Supabase Cloud Database seeding completed successfully!');
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
