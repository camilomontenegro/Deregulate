'use client';

import { useState, useEffect } from 'react';

interface ApiUsage {
  used: number;
  total: number;
  remaining: number;
  resetDate: string;
}

interface DatabaseStats {
  total: number;
  byOperation: Record<string, number>;
  byPropertyType: Record<string, number>;
  byMunicipality: Record<string, number>;
}

interface ScrapingResults {
  city: string;
  propertyType: string;
  operation: string;
  startTime: string;
  requestsUsed: number;
  propertiesFound: number;
  propertiesStored: number;
  pages: Array<{ page: number; propertiesCount: number }>;
  errors: Array<{ page?: number; error: string }>;
  duration: number;
}

interface FormData {
  city: string;
  propertyType: string;
  operation: string;
  maxRequests: number;
  distance: number;
  order: string;
  sort: 'asc' | 'desc';
  randomMode: boolean;
  provinceWide: boolean;
}

export default function AdminPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [scrapingResults, setScrapingResults] = useState<ScrapingResults | null>(null);
  const [apiUsage, setApiUsage] = useState<ApiUsage | null>(null);
  const [databaseStats, setDatabaseStats] = useState<DatabaseStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    city: 'Madrid',
    propertyType: 'homes',
    operation: 'sale',
    maxRequests: 5,
    distance: 2000,
    order: 'price',
    sort: 'asc',
    randomMode: false,
    provinceWide: false
  });

  const cities = ['Madrid', 'Barcelona', 'Sevilla', 'Valencia', 'Bilbao', 'Málaga'];
  const propertyTypes = [
    { value: 'homes', label: 'Homes' },
    { value: 'offices', label: 'Offices' },
    { value: 'premises', label: 'Premises' },
    { value: 'garages', label: 'Garages' },
    { value: 'bedrooms', label: 'Bedrooms' }
  ];
  const operations = [
    { value: 'sale', label: 'Sale' },
    { value: 'rent', label: 'Rent' }
  ];

  const distanceOptions = [
    { value: 500, label: '500m' },
    { value: 1000, label: '1km' },
    { value: 2000, label: '2km (default)' },
    { value: 3000, label: '3km' },
    { value: 5000, label: '5km' },
    { value: 10000, label: '10km' }
  ];

  const orderOptions = [
    { value: 'price', label: 'Price' },
    { value: 'publicationDate', label: 'Publication Date' },
    { value: 'distance', label: 'Distance from Center' },
    { value: 'size', label: 'Size (if available)' },
    { value: 'modificationDate', label: 'Last Modified (rentals)' }
  ];

  const sortOptions = [
    { value: 'asc', label: 'Ascending (Low to High / Old to New)' },
    { value: 'desc', label: 'Descending (High to Low / New to Old)' }
  ];

  useEffect(() => {
    fetchUsageStats();
  }, []);

  const fetchUsageStats = async () => {
    try {
      const response = await fetch('/api/admin/usage');
      if (response.ok) {
        const data = await response.json();
        setApiUsage(data.data.apiUsage);
        setDatabaseStats(data.data.databaseStats);
      }
    } catch (error) {
      console.error('Error fetching usage stats:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (name === 'maxRequests' || name === 'distance' ? (value ? parseInt(value) || 1 : 1) : value)
    }));
  };

  const handleStartScraping = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setScrapingResults(null);

    try {
      const response = await fetch('/api/admin/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        setScrapingResults(data.results);
        await fetchUsageStats();
      } else {
        setError(data.error || 'An error occurred during scraping');
      }
    } catch (error) {
      setError('Failed to connect to the scraping service');
      console.error('Scraping error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Idealista Admin Dashboard</h1>
          <p className="mt-2 text-gray-600">Manage property scraping and view API usage statistics</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">API Usage</h2>
              {apiUsage ? (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Used:</span>
                    <span className="text-sm font-medium">{apiUsage.used}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Total:</span>
                    <span className="text-sm font-medium">{apiUsage.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Remaining:</span>
                    <span className={`text-sm font-medium ${ 
                      apiUsage.remaining < 10 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {apiUsage.remaining}
                    </span>
                  </div>
                  
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className={`h-2.5 rounded-full ${
                        apiUsage.remaining < 10 ? 'bg-red-600' : 'bg-blue-600'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, (apiUsage.used / apiUsage.total) * 100))}%` }}
                    ></div>
                  </div>
                  
                  <div className="text-xs text-gray-500">
                    Resets: {apiUsage.resetDate}
                  </div>
                </div>
              ) : (
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                </div>
              )}
            </div>

            {databaseStats && (
              <div className="bg-white shadow rounded-lg p-6 mt-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Database Stats</h2>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Total Properties:</span>
                    <span className="text-sm font-medium">{databaseStats.total}</span>
                  </div>
                  
                  <div className="mt-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">By Operation:</h3>
                    {Object.entries(databaseStats.byOperation).map(([operation, count]) => (
                      <div key={operation} className="flex justify-between text-sm">
                        <span className="text-gray-500 capitalize">{operation}:</span>
                        <span>{count}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Top Cities:</h3>
                    {Object.entries(databaseStats.byMunicipality)
                      .sort(([,a], [,b]) => b - a)
                      .slice(0, 5)
                      .map(([city, count]) => (
                      <div key={city} className="flex justify-between text-sm">
                        <span className="text-gray-500">{city}:</span>
                        <span>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Start Scraping</h2>
              
              <form onSubmit={handleStartScraping} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="city" className="block text-sm font-medium text-gray-700">
                      City
                    </label>
                    <select
                      id="city"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                    >
                      {cities.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="propertyType" className="block text-sm font-medium text-gray-700">
                      Property Type
                    </label>
                    <select
                      id="propertyType"
                      name="propertyType"
                      value={formData.propertyType}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                    >
                      {propertyTypes.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="operation" className="block text-sm font-medium text-gray-700">
                      Operation
                    </label>
                    <select
                      id="operation"
                      name="operation"
                      value={formData.operation}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                    >
                      {operations.map(op => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="maxRequests" className="block text-sm font-medium text-gray-700">
                      Max Requests
                    </label>
                    <input
                      type="number"
                      id="maxRequests"
                      name="maxRequests"
                      min="1"
                      max="20"
                      value={formData.maxRequests}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Higher values use more API credits (max 20)
                    </p>
                  </div>

                  <div>
                    <label htmlFor="distance" className="block text-sm font-medium text-gray-700">
                      Search Radius
                    </label>
                    <select
                      id="distance"
                      name="distance"
                      value={formData.distance}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                    >
                      {distanceOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Radius from city center to search for properties
                    </p>
                  </div>

                  <div>
                    <label htmlFor="order" className="block text-sm font-medium text-gray-700">
                      Sort By
                    </label>
                    <select
                      id="order"
                      name="order"
                      value={formData.order}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                    >
                      {orderOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      How to sort the search results
                    </p>
                  </div>

                  <div>
                    <label htmlFor="sort" className="block text-sm font-medium text-gray-700">
                      Sort Order
                    </label>
                    <select
                      id="sort"
                      name="sort"
                      value={formData.sort}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                    >
                      {sortOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Ascending or descending order
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="randomMode"
                      name="randomMode"
                      checked={formData.randomMode}
                      onChange={handleInputChange}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="randomMode" className="ml-2 block text-sm text-gray-900">
                      Random Mode
                    </label>
                    <div className="ml-2">
                      <span className="text-xs text-gray-500">
                        Sample random pages and vary search parameters for better diversity
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="provinceWide"
                      name="provinceWide"
                      checked={formData.provinceWide}
                      onChange={handleInputChange}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="provinceWide" className="ml-2 block text-sm text-gray-900">
                      Province-Wide Search
                    </label>
                    <div className="ml-2">
                      <span className="text-xs text-gray-500">
                        Include towns and smaller cities across the entire province
                      </span>
                    </div>
                  </div>
                </div>

                {apiUsage && apiUsage.remaining < formData.maxRequests && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                    <div className="flex">
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">
                          Insufficient API Credits
                        </h3>
                        <div className="mt-2 text-sm text-yellow-700">
                          <p>
                            You have {apiUsage.remaining} API credits remaining, but this scraping session 
                            requires {formData.maxRequests} credits. Please reduce the max requests or wait 
                            for your credits to reset on {apiUsage.resetDate}.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || !!(apiUsage && apiUsage.remaining < formData.maxRequests)}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Scraping...
                    </>
                  ) : (
                    'Start Scraping'
                  )}
                </button>
              </form>

              {error && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}

              {scrapingResults && (
                <div className="mt-6 bg-green-50 border border-green-200 rounded-md p-4">
                  <h3 className="text-lg font-medium text-green-800 mb-3">Scraping Completed</h3>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{scrapingResults.propertiesFound}</div>
                      <div className="text-sm text-gray-500">Properties Found</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{scrapingResults.propertiesStored}</div>
                      <div className="text-sm text-gray-500">Stored</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">{scrapingResults.requestsUsed}</div>
                      <div className="text-sm text-gray-500">API Calls</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {formatDuration(scrapingResults.duration)}
                      </div>
                      <div className="text-sm text-gray-500">Duration</div>
                    </div>
                  </div>

                  {scrapingResults.pages.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Pages Scraped:</h4>
                      <div className="space-y-1">
                        {scrapingResults.pages.map((page, index) => (
                          <div key={index} className="text-sm text-gray-600">
                            Page {page.page}: {page.propertiesCount} properties
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {scrapingResults.errors.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-red-700 mb-2">Errors:</h4>
                      <div className="space-y-1">
                        {scrapingResults.errors.map((error, index) => (
                          <div key={index} className="text-sm text-red-600">
                            {error.page ? `Page ${error.page}: ` : ''}{error.error}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}