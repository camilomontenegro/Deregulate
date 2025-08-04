const { createClient } = require('@supabase/supabase-js');

class SupabaseClient {
  constructor() {
    this.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    this.supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    this.client = createClient(this.supabaseUrl, this.supabaseKey);
    this.tableName = 'houses';
  }

  async insertProperty(propertyData) {
    try {
      const transformedData = this.transformIdealistaData(propertyData);
      
      const { data, error } = await this.client
        .from(this.tableName)
        .insert([transformedData])
        .select();

      if (error) {
        if (error.code === '23505') {
          console.log(`Property ${propertyData.propertyCode} already exists, skipping...`);
          return { success: true, action: 'skipped', data: null };
        }
        throw error;
      }

      console.log(`Property ${propertyData.propertyCode} inserted successfully`);
      return { success: true, action: 'inserted', data: data[0] };
      
    } catch (error) {
      console.error('Error inserting property:', error);
      throw error;
    }
  }

  async bulkInsertProperties(properties) {
    const results = {
      inserted: 0,
      skipped: 0,
      errors: 0,
      details: []
    };

    for (const property of properties) {
      try {
        const result = await this.insertProperty(property);
        
        if (result.action === 'inserted') {
          results.inserted++;
        } else if (result.action === 'skipped') {
          results.skipped++;
        }
        
        results.details.push({
          propertyCode: property.propertyCode,
          success: true,
          action: result.action
        });
        
      } catch (error) {
        results.errors++;
        results.details.push({
          propertyCode: property.propertyCode,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  async getProperties(filters = {}) {
    try {
      let query = this.client.from(this.tableName).select('*');
      
      if (filters.municipality) {
        query = query.eq('municipality', filters.municipality);
      }
      
      if (filters.operation) {
        query = query.eq('operation', filters.operation);
      }
      
      if (filters.propertyType) {
        query = query.eq('property_type', filters.propertyType);
      }
      
      if (filters.minPrice) {
        query = query.gte('price', filters.minPrice);
      }
      
      if (filters.maxPrice) {
        query = query.lte('price', filters.maxPrice);
      }
      
      if (filters.limit) {
        query = query.limit(filters.limit);
      }
      
      query = query.order('scraped_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      return data;
      
    } catch (error) {
      console.error('Error fetching properties:', error);
      throw error;
    }
  }

  async updateProperty(propertyCode, updates) {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .update(updates)
        .eq('property_code', propertyCode)
        .select();

      if (error) throw error;

      return data[0];
      
    } catch (error) {
      console.error('Error updating property:', error);
      throw error;
    }
  }

  async deleteProperty(propertyCode) {
    try {
      const { error } = await this.client
        .from(this.tableName)
        .delete()
        .eq('property_code', propertyCode);

      if (error) throw error;

      return true;
      
    } catch (error) {
      console.error('Error deleting property:', error);
      throw error;
    }
  }

  async getStats() {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('operation, property_type, municipality')
        .order('scraped_at', { ascending: false });

      if (error) throw error;

      const stats = {
        total: data.length,
        byOperation: {},
        byPropertyType: {},
        byMunicipality: {},
        recentCount: 0
      };

      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      data.forEach(property => {
        stats.byOperation[property.operation] = (stats.byOperation[property.operation] || 0) + 1;
        stats.byPropertyType[property.property_type] = (stats.byPropertyType[property.property_type] || 0) + 1;
        stats.byMunicipality[property.municipality] = (stats.byMunicipality[property.municipality] || 0) + 1;
      });

      return stats;
      
    } catch (error) {
      console.error('Error getting stats:', error);
      throw error;
    }
  }

  transformIdealistaData(property) {
    return {
      property_code: property.propertyCode,
      address: property.address || '',
      price: property.price || 0,
      operation: property.operation || 'sale',
      property_type: this.mapPropertyType(property.propertyType),
      size: property.size || null,
      rooms: property.rooms || null,
      bathrooms: property.bathrooms || null,
      floor: property.floor || null,
      exterior: property.exterior || false,
      latitude: property.latitude || null,
      longitude: property.longitude || null,
      municipality: property.municipality || '',
      district: property.district || '',
      neighborhood: property.neighborhood || '',
      province: property.province || '',
      status: property.status || 'active',
      new_development: property.newDevelopment || false,
      url: property.url || '',
      scraped_at: new Date().toISOString()
    };
  }

  mapPropertyType(idealistaType) {
    const typeMap = {
      'homes': 'home',
      'offices': 'office', 
      'premises': 'premise',
      'garages': 'garage',
      'bedrooms': 'bedroom'
    };
    
    return typeMap[idealistaType] || idealistaType;
  }

  async testConnection() {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('count')
        .limit(1);

      if (error) throw error;

      return { success: true, message: 'Supabase connection successful' };
      
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

module.exports = new SupabaseClient();