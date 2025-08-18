'use client';

import { useState, useEffect } from 'react';


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
  order: string;
  sort: 'asc' | 'desc';
}

export default function AdminPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [scrapingResults, setScrapingResults] = useState<ScrapingResults | null>(null);
  const [databaseStats, setDatabaseStats] = useState<DatabaseStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDensityLoading, setIsDensityLoading] = useState(false);
  const [densityResults, setDensityResults] = useState<any>(null);
  const [densityError, setDensityError] = useState<string | null>(null);
  const [maxBuildings, setMaxBuildings] = useState<number>(500);

  const [formData, setFormData] = useState<FormData>({
    city: 'Madrid',
    propertyType: 'homes',
    operation: 'sale',
    maxRequests: 5,
    order: 'price',
    sort: 'asc'
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


  const orderOptions = [
    { value: 'price', label: 'Price' },
    { value: 'publicationDate', label: 'Publication Date' },
    { value: 'size', label: 'Size (if available)' },
    { value: 'modificationDate', label: 'Last Modified (rentals)' }
  ];

  const sortOptions = [
    { value: 'asc', label: 'Ascending (Low to High / Old to New)' },
    { value: 'desc', label: 'Descending (High to Low / New to Old)' }
  ];

  useEffect(() => {
    fetchDatabaseStats();
  }, []);

  const fetchDatabaseStats = async () => {
    try {
      const response = await fetch('/api/admin/usage');
      if (response.ok) {
        const data = await response.json();
        setDatabaseStats(data.data.databaseStats);
      }
    } catch (error) {
      console.error('Error fetching database stats:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (name === 'maxRequests' ? (value ? parseInt(value) || 1 : 1) : value)
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
        await fetchDatabaseStats();
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

  const handleDensityIngestion = async () => {
    setIsDensityLoading(true);
    setDensityError(null);
    setDensityResults(null);

    try {
      // For now, we'll trigger the npm script directly via a simple fetch
      // In production, you'd want to create a proper API endpoint
      const response = await fetch('/api/admin/density', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ maxBuildings })
      });

      const data = await response.json();

      if (response.ok) {
        setDensityResults(data.results);
      } else {
        setDensityError(data.error || 'An error occurred during density ingestion');
      }
    } catch (error) {
      setDensityError('Failed to connect to the density ingestion service');
      console.error('Density ingestion error:', error);
    } finally {
      setIsDensityLoading(false);
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
          <p className="mt-2 text-gray-600">Scrape property data province-wide and view database statistics</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            {databaseStats && (
              <div className="bg-white shadow rounded-lg p-6">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
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
                      Number of pages to scrape per province (max 20)
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


                <button
                  type="submit"
                  disabled={isLoading}
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

            {/* Building Density Ingestion Card */}
            <div className="mt-8 bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Building Density Ingestion</h2>
              <p className="text-sm text-gray-600 mb-4">
                Process GeoJSON file from /data/sevilla_buildings.geojson to extract building density data directly from the file.
              </p>
              
              <div className="mb-4">
                <label htmlFor="maxBuildings" className="block text-sm font-medium text-gray-700">
                  Max Buildings to Process
                </label>
                <input
                  type="number"
                  id="maxBuildings"
                  name="maxBuildings"
                  min="1"
                  max="10000"
                  value={maxBuildings}
                  onChange={(e) => setMaxBuildings(parseInt(e.target.value) || 500)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm border p-2"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Number of buildings to process from the GeoJSON file (recommended: 500-1000 for testing)
                </p>
              </div>
              
              <button
                onClick={handleDensityIngestion}
                disabled={isDensityLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isDensityLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing GeoJSON...
                  </>
                ) : (
                  `Start Density Ingestion (${maxBuildings} buildings)`
                )}
              </button>

              {densityError && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
                  <div className="text-sm text-red-700">{densityError}</div>
                </div>
              )}

              {densityResults && (
                <div className="mt-6 bg-green-50 border border-green-200 rounded-md p-4">
                  <h3 className="text-lg font-medium text-green-800 mb-3">Density Ingestion Completed</h3>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{densityResults.processed || 0}</div>
                      <div className="text-sm text-gray-500">Buildings Processed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{densityResults.uniqueRCs || 0}</div>
                      <div className="text-sm text-gray-500">Unique References</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {densityResults.duration ? formatDuration(densityResults.duration) : 'N/A'}
                      </div>
                      <div className="text-sm text-gray-500">Duration</div>
                    </div>
                  </div>

                  {densityResults.message && (
                    <div className="text-sm text-gray-600 mt-2">
                      {densityResults.message}
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