// Test script to diagnose Supabase permissions issues
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase environment variables');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', !!SUPABASE_URL);
  console.error('SUPABASE_SERVICE_ROLE_KEY:', !!SUPABASE_SERVICE_ROLE_KEY);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testPermissions() {
  console.log('🔍 Testing Supabase permissions...\n');

  try {
    // Test 1: Check if we can read from the table
    console.log('📖 Test 1: Reading existing records...');
    const { data: readData, error: readError, count } = await supabase
      .from('building_density')
      .select('cadastral_ref_building', { count: 'exact' })
      .limit(5);
    
    if (readError) {
      console.error('❌ READ FAILED:', readError);
      return;
    }
    
    console.log(`✅ Read successful: ${count} total records, sample:`, readData?.map(r => r.cadastral_ref_building));

    // Test 2: Try to insert a test record
    console.log('\n📝 Test 2: Inserting test record...');
    const testRecord = {
      cadastral_ref_building: 'TEST_RECORD_' + Date.now(),
      total_apartments: 5,
      building_address: 'Test Address',
      latitude: 37.4,
      longitude: -6.0,
      municipality: 'Sevilla',
      province: 'Sevilla',
      last_updated: new Date().toISOString()
    };

    const { data: insertData, error: insertError } = await supabase
      .from('building_density')
      .insert([testRecord])
      .select();
    
    if (insertError) {
      console.error('❌ INSERT FAILED:', insertError);
      console.log('Error details:', {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint
      });
      return;
    }
    
    if (!insertData || insertData.length === 0) {
      console.error('❌ INSERT SILENT FAILURE: No error but no data returned');
      console.log('This typically indicates RLS policy is blocking the insert');
      return;
    }
    
    console.log('✅ Insert successful:', insertData[0].cadastral_ref_building);

    // Test 3: Try to update the test record
    console.log('\n✏️ Test 3: Updating test record...');
    const { data: updateData, error: updateError } = await supabase
      .from('building_density')
      .update({ total_apartments: 10 })
      .eq('cadastral_ref_building', testRecord.cadastral_ref_building)
      .select();
    
    if (updateError) {
      console.error('❌ UPDATE FAILED:', updateError);
      return;
    }
    
    if (!updateData || updateData.length === 0) {
      console.error('❌ UPDATE SILENT FAILURE: No error but no data returned');
      return;
    }
    
    console.log('✅ Update successful:', updateData[0].total_apartments);

    // Test 4: Clean up - delete the test record
    console.log('\n🗑️ Test 4: Cleaning up test record...');
    const { error: deleteError } = await supabase
      .from('building_density')
      .delete()
      .eq('cadastral_ref_building', testRecord.cadastral_ref_building);
    
    if (deleteError) {
      console.error('❌ DELETE FAILED:', deleteError);
      console.log('⚠️ Test record may remain in database:', testRecord.cadastral_ref_building);
      return;
    }
    
    console.log('✅ Delete successful');

    // Test 5: Check RLS policies
    console.log('\n🔐 Test 5: Checking RLS status...');
    const { data: tableInfo, error: tableError } = await supabase
      .rpc('check_table_rls', { table_name: 'building_density' })
      .single();
    
    // This RPC might not exist, so we'll just try a different approach
    if (tableError) {
      console.log('ℹ️ Cannot check RLS directly (RPC not available)');
    } else {
      console.log('🔐 RLS info:', tableInfo);
    }

    console.log('\n🎉 All tests passed! Supabase permissions are working correctly.');
    console.log('✅ The ingestion issue is not related to basic permissions.');
    console.log('🔍 Check for more specific issues like constraint violations or batch size limits.');

  } catch (error) {
    console.error('💥 Unexpected error during testing:', error);
  }
}

// Run the tests
testPermissions().catch(console.error);