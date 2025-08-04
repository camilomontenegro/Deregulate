const idealistaAuth = require('./auth');

class IdealistaSearch {
  constructor() {
    this.baseUrl = 'https://api.idealista.com/3.5';
    this.requestCount = 0;
    this.maxRequestsPerMonth = 100;
  }

  validateSearchParams(params) {
    const {
      operation,
      propertyType,
      center,
      distance,
      country = 'es',
      maxItems = 50,
      numPage = 1
    } = params;

    if (!operation || !['sale', 'rent'].includes(operation)) {
      throw new Error('Operation must be "sale" or "rent"');
    }

    if (!propertyType || !['homes', 'offices', 'premises', 'garages', 'bedrooms'].includes(propertyType)) {
      throw new Error('Property type must be one of: homes, offices, premises, garages, bedrooms');
    }

    if (!center) {
      throw new Error('Center coordinates are required');
    }

    if (maxItems > 50) {
      throw new Error('Maximum items per request is 50');
    }

    return {
      operation,
      propertyType,
      center,
      distance: distance || 2000,
      country,
      maxItems,
      numPage
    };
  }

  buildSearchUrl(params) {
    const validParams = this.validateSearchParams(params);
    const queryString = new URLSearchParams(validParams).toString();
    return `${this.baseUrl}/${validParams.country}/search?${queryString}`;
  }

  async searchProperties(searchParams) {
    if (this.requestCount >= this.maxRequestsPerMonth) {
      throw new Error(`Monthly API limit reached (${this.maxRequestsPerMonth} requests)`);
    }

    try {
      const token = await idealistaAuth.getBearerToken();
      const url = this.buildSearchUrl(searchParams);

      console.log(`Making Idealista API request: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json',
        }
      });

      this.requestCount++;
      console.log(`API requests used: ${this.requestCount}/${this.maxRequestsPerMonth}`);

      if (!response.ok) {
        const errorText = await response.text();
        
        if (response.status === 401) {
          idealistaAuth.clearToken();
          throw new Error('Authentication failed - token may be expired');
        }
        
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.elementList) {
        console.warn('No elementList in response:', data);
        return {
          properties: [],
          total: 0,
          actualTotal: 0,
          totalPages: 0,
          currentPage: searchParams.numPage || 1
        };
      }

      return {
        properties: data.elementList,
        total: data.total || 0,
        actualTotal: data.actualTotal || 0,
        totalPages: data.totalPages || 0,
        currentPage: data.numPage || 1,
        summary: data.summary
      };

    } catch (error) {
      console.error('Error searching properties:', error);
      throw error;
    }
  }

  async searchByLocation(location, options = {}) {
    const defaultParams = {
      operation: 'sale',
      propertyType: 'homes',
      distance: 2000,
      maxItems: 50,
      numPage: 1,
      ...options
    };

    let center;
    if (typeof location === 'string') {
      center = await this.geocodeLocation(location);
    } else if (location.lat && location.lng) {
      center = `${location.lat},${location.lng}`;
    } else {
      throw new Error('Location must be a string address or {lat, lng} object');
    }

    return this.searchProperties({
      ...defaultParams,
      center
    });
  }

  async geocodeLocation(address) {
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
    
    try {
      const response = await fetch(geocodeUrl);
      const data = await response.json();

      if (data.status !== 'OK' || !data.results.length) {
        throw new Error(`Geocoding failed for address: ${address}`);
      }

      const { lat, lng } = data.results[0].geometry.location;
      return `${lat},${lng}`;
    } catch (error) {
      console.error('Geocoding error:', error);
      throw new Error(`Could not geocode address: ${address}`);
    }
  }

  getRequestCount() {
    return {
      used: this.requestCount,
      total: this.maxRequestsPerMonth,
      remaining: this.maxRequestsPerMonth - this.requestCount
    };
  }

  resetRequestCount() {
    this.requestCount = 0;
  }
}

module.exports = new IdealistaSearch();