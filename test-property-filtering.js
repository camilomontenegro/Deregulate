// Simple test script for property code filtering
// Run with: node test-property-filtering.js

import supabaseClient from './app/lib/supabase/client.js';

async function testPropertyFiltering() {
  try {
    console.log('🧪 Testing property code filtering...');
    
    // Test 1: Get existing property codes
    console.log('\n1. Testing getExistingPropertyCodes():');
    const existingCodes = await supabaseClient.getExistingPropertyCodes();
    console.log(`   Found ${existingCodes.size} existing property codes`);
    
    // Test 2: Test filtering with mock data
    console.log('\n2. Testing filterNewProperties():');
    const mockProperties = [
      { propertyCode: 12345678, address: 'Test Address 1' },
      { propertyCode: 87654321, address: 'Test Address 2' },
      { propertyCode: 99999999, address: 'Test Address 3' } // This one should be new
    ];
    
    const newProperties = supabaseClient.filterNewProperties(mockProperties, existingCodes);
    console.log(`   Input: ${mockProperties.length} properties`);
    console.log(`   Output: ${newProperties.length} new properties`);
    console.log(`   Filtered out: ${mockProperties.length - newProperties.length} existing properties`);
    
    // Test 3: Test connection
    console.log('\n3. Testing database connection:');
    const connectionTest = await supabaseClient.testConnection();
    console.log(`   Connection: ${connectionTest.success ? '✅ Success' : '❌ Failed'}`);
    if (!connectionTest.success) {
      console.log(`   Error: ${connectionTest.message}`);
    }
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testPropertyFiltering();
}

export { testPropertyFiltering };