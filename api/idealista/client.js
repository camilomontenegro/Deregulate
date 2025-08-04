const idealistaAuth = require('./auth');
const idealistaSearch = require('./search');

class IdealistaClient {
  constructor() {
    this.auth = idealistaAuth;
    this.search = idealistaSearch;
    this.apiUsage = {
      totalRequests: 0,
      monthlyLimit: 100,
      lastResetDate: new Date().toISOString().slice(0, 7)
    };
  }

  async initialize() {
    try {
      await this.auth.getAccessToken();
      console.log('Idealista client initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Idealista client:', error);
      throw error;
    }
  }

  async searchProperties(params) {
    this.trackApiUsage();
    return await this.search.searchProperties(params);
  }

  async searchByCity(city, options = {}) {
    this.trackApiUsage();
    return await this.search.searchByLocation(city, options);
  }

  async searchByCoordinates(lat, lng, options = {}) {
    this.trackApiUsage();
    return await this.search.searchByLocation({ lat, lng }, options);
  }

  async bulkSearchCities(cities, options = {}) {
    const results = [];
    const errors = [];
    
    for (const city of cities) {
      try {
        if (this.getRemainingRequests() <= 0) {
          throw new Error('Monthly API limit reached');
        }
        
        console.log(`Searching properties in ${city}...`);
        const result = await this.searchByCity(city, options);
        results.push({
          city,
          success: true,
          data: result
        });
        
        await this.delay(1000);
        
      } catch (error) {
        console.error(`Error searching ${city}:`, error.message);
        errors.push({
          city,
          success: false,
          error: error.message
        });
      }
    }

    return {
      results,
      errors,
      summary: {
        total: cities.length,
        successful: results.length,
        failed: errors.length,
        apiUsage: this.getApiUsage()
      }
    };
  }

  async getPropertyDetails(propertyCode) {
    this.trackApiUsage();
    
    try {
      const token = await this.auth.getBearerToken();
      const url = `https://api.idealista.com/3.5/es/search?operation=sale&propertyCode=${propertyCode}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get property details: ${response.status}`);
      }

      const data = await response.json();
      return data.elementList?.[0] || null;
      
    } catch (error) {
      console.error('Error getting property details:', error);
      throw error;
    }
  }

  trackApiUsage() {
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    if (this.apiUsage.lastResetDate !== currentMonth) {
      this.apiUsage.totalRequests = 0;
      this.apiUsage.lastResetDate = currentMonth;
      this.search.resetRequestCount();
    }
    
    this.apiUsage.totalRequests++;
  }

  getApiUsage() {
    return {
      used: this.search.getRequestCount().used,
      total: this.apiUsage.monthlyLimit,
      remaining: this.getRemainingRequests(),
      resetDate: this.getNextResetDate()
    };
  }

  getRemainingRequests() {
    return Math.max(0, this.apiUsage.monthlyLimit - this.search.getRequestCount().used);
  }

  getNextResetDate() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth.toISOString().slice(0, 10);
  }

  async validateConnection() {
    try {
      const testParams = {
        operation: 'sale',
        propertyType: 'homes',
        center: '40.416775,-3.703790',
        distance: 1000,
        maxItems: 1
      };
      
      await this.searchProperties(testParams);
      return { valid: true, message: 'Connection successful' };
      
    } catch (error) {
      return { valid: false, message: error.message };
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  logRequest(url, method = 'GET', response = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      method,
      url,
      status: response?.status,
      usage: this.getApiUsage()
    };
    
    console.log('Idealista API Request:', logEntry);
    return logEntry;
  }
}

module.exports = new IdealistaClient();