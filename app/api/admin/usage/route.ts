import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    // Mock API usage data for now
    const apiUsage = {
      used: 0,
      total: 100,
      remaining: 100,
      resetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().slice(0, 10)
    };

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Get database stats
    const { data: houses, error } = await supabase
      .from('houses')
      .select('operation, property_type, municipality')
      .order('scraped_at', { ascending: false });

    let databaseStats = {
      total: 0,
      byOperation: {} as Record<string, number>,
      byPropertyType: {} as Record<string, number>,
      byMunicipality: {} as Record<string, number>
    };

    if (!error && houses) {
      databaseStats.total = houses.length;
      
      houses.forEach((house: any) => {
        // Count by operation
        databaseStats.byOperation[house.operation] = (databaseStats.byOperation[house.operation] || 0) + 1;
        
        // Count by property type
        databaseStats.byPropertyType[house.property_type] = (databaseStats.byPropertyType[house.property_type] || 0) + 1;
        
        // Count by municipality
        databaseStats.byMunicipality[house.municipality] = (databaseStats.byMunicipality[house.municipality] || 0) + 1;
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        apiUsage,
        databaseStats
      }
    });

  } catch (error: any) {
    console.error('Error getting usage stats:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}