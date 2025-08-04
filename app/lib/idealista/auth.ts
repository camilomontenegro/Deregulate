class IdealistaAuth {
  constructor() {
    this.apiKey = process.env.IDEALISTA_API_KEY;
    this.secret = process.env.IDEALISTA_SECRET;
    this.tokenUrl = 'https://api.idealista.com/oauth/token';
    this.token = null;
    this.tokenExpiry = null;
  }

  getBasicAuthHeader() {
    const credentials = Buffer.from(`${this.apiKey}:${this.secret}`).toString('base64');
    return `Basic ${credentials}`;
  }

  async getAccessToken() {
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    try {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': this.getBasicAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials&scope=read'
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.access_token) {
        throw new Error('No access token received from Idealista API');
      }

      this.token = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
      
      console.log(`Idealista token acquired, expires in ${data.expires_in} seconds`);
      
      return this.token;
    } catch (error) {
      console.error('Error getting Idealista access token:', error);
      throw error;
    }
  }

  async getBearerToken() {
    const token = await this.getAccessToken();
    return `Bearer ${token}`;
  }

  isTokenValid() {
    return this.token && this.tokenExpiry && Date.now() < this.tokenExpiry;
  }

  clearToken() {
    this.token = null;
    this.tokenExpiry = null;
  }
}

const idealistaAuth = new IdealistaAuth();

export default idealistaAuth;