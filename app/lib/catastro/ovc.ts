// app/lib/catastro/ovc.ts
import Bottleneck from "bottleneck";

export const limiter = new Bottleneck({ 
  minTime: 5000, // 5 seconds between requests (0.2 req/s)
  maxConcurrent: 1 // Only 1 request at a time
}); // Ultra conservative rate limiting

export async function resolveRCByPoint(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://ovc.catastro.meh.es/ovcservweb/ovccoordenadas.asmx/Consulta_RCCOOR_Distancia?SRS=4326&Coordenada_X=${lon}&Coordenada_Y=${lat}&Distancia=25`;
    
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/xml, application/xml, application/xhtml+xml, text/html;q=0.9, text/plain;q=0.8, image/png, */*;q=0.5',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache'
      },
      timeout: 10000
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const xml = await res.text();
    
    // Check for error in XML response
    if (xml.includes('<error>') || xml.includes('ERROR')) {
      console.warn(`Cadastral API error for coordinates ${lat},${lon}: ${xml.substring(0, 200)}`);
      return null;
    }
    
    return /<rc>([^<]+)<\/rc>/i.exec(xml)?.[1] ?? null;
  } catch (error) {
    console.error(`Failed to resolve RC for coordinates ${lat},${lon}:`, error.message);
    return null;
  }
}

export async function getApartmentCountByRC(rc14: string): Promise<{
  apartments: number;
  address?: string;
  municipality?: string;
  province?: string;
  raw: string;
} | null> {
  try {
    const url = `https://ovc.catastro.meh.es/ovcservweb/ovccallejero.asmx/Consulta_DNPRC?RC=${rc14}`;
    
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/xml, application/xml, application/xhtml+xml, text/html;q=0.9, text/plain;q=0.8, image/png, */*;q=0.5',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache'
      },
      timeout: 10000
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const xml = await res.text();
    
    // Check for error in XML response
    if (xml.includes('<error>') || xml.includes('ERROR')) {
      console.warn(`Cadastral API error for RC ${rc14}: ${xml.substring(0, 200)}`);
      return null;
    }

    // Sum "viviendas" from several possible tags
    const m1 = [...xml.matchAll(/<uso>\s*(?:VIVIENDA|RESIDENCIAL)\s*<\/uso>[\s\S]*?<num(?:Elemen|Elementos|Viviendas)>(\d+)<\/num/gi)]
      .reduce((a, m) => a + Number(m[1]), 0);
    const m2 = [...xml.matchAll(/<viviendas>(\d+)<\/viviendas>/gi)]
      .reduce((a, m) => a + Number(m[1]), 0);

    const apartments = m1 || m2 || 0;
    if (!apartments) return null;

    const address = /<ldt>([^<]+)<\/ldt>/i.exec(xml)?.[1] ?? undefined;
    const municipality = /<nm>([^<]+)<\/nm>/i.exec(xml)?.[1] ?? "Sevilla";
    const province = /<np>([^<]+)<\/np>/i.exec(xml)?.[1] ?? "Sevilla";

    return { apartments, address, municipality, province, raw: xml };
  } catch (error) {
    console.error(`Failed to get apartment count for RC ${rc14}:`, error.message);
    return null;
  }
}