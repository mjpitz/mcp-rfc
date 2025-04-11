import axios from 'axios';
import { JSDOM } from 'jsdom';

interface RfcMetadata {
  number: string;
  title: string;
  authors: string[];
  date: string;
  status: string;
  abstract: string;
  url: string;
}

interface RfcContent {
  metadata: RfcMetadata;
  sections: {
    title: string;
    content: string;
    subsections?: {
      title: string;
      content: string;
    }[];
  }[];
  fullText: string;
}

export class RfcService {
  private baseUrl = 'https://www.ietf.org/rfc';
  private cacheDirectory = './cache';
  private cache: Map<string, RfcContent> = new Map();

  /**
   * Fetch an RFC document by its number
   * @param rfcNumber RFC number (e.g. '2616')
   * @returns The RFC content with parsed metadata and sections
   */
  async fetchRfc(rfcNumber: string): Promise<RfcContent> {
    // Check cache first
    if (this.cache.has(rfcNumber)) {
      return this.cache.get(rfcNumber)!;
    }

    // Fetch the RFC in both HTML and TXT formats
    const txtUrl = `${this.baseUrl}/rfc${rfcNumber}.txt`;
    const htmlUrl = `${this.baseUrl}/rfc${rfcNumber}/`;

    try {
      // Try HTML first for better structure
      const htmlResponse = await axios.get(htmlUrl);
      const rfc = this.parseHtmlRfc(htmlResponse.data, rfcNumber, htmlUrl);
      this.cache.set(rfcNumber, rfc);
      return rfc;
    } catch (error) {
      try {
        // Fallback to TXT format
        console.error(`Failed to fetch HTML format for RFC ${rfcNumber}, trying TXT format`);
        const txtResponse = await axios.get(txtUrl);
        const rfc = this.parseTxtRfc(txtResponse.data, rfcNumber, txtUrl);
        this.cache.set(rfcNumber, rfc);
        return rfc;
      } catch (txtError) {
        throw new Error(`Failed to fetch RFC ${rfcNumber}: ${txtError}`);
      }
    }
  }

  /**
   * Search for RFCs by keyword
   * @param keyword Keyword to search for
   * @returns List of matching RFC metadata
   */
  async searchRfcs(keyword: string): Promise<RfcMetadata[]> {
    try {
      // Search on the IETF website
      const searchUrl = `https://www.ietf.org/search/?query=${encodeURIComponent(keyword)}`;
      const response = await axios.get(searchUrl);
      
      const dom = new JSDOM(response.data);
      const document = dom.window.document;
      
      // Extract search results
      const results: RfcMetadata[] = [];
      const searchResults = document.querySelectorAll('.search-listing-content');
      
      for (const result of searchResults) {
        const titleElement = result.querySelector('h4 a');
        if (!titleElement) continue;
        
        const titleText = titleElement.textContent?.trim() || '';
        const url = titleElement.getAttribute('href') || '';
        
        // Check if this is an RFC result
        const rfcMatch = titleText.match(/RFC\s+(\d+)/i);
        if (!rfcMatch) continue;
        
        const rfcNumber = rfcMatch[1];
        const descriptionElement = result.querySelector('.snippet');
        const description = descriptionElement?.textContent?.trim() || '';
        
        results.push({
          number: rfcNumber,
          title: titleText.replace(/RFC\s+\d+:\s*/i, '').trim(),
          authors: [], // Would need to fetch the full RFC to get this
          date: '', // Would need to fetch the full RFC to get this
          status: '', // Would need to fetch the full RFC to get this
          abstract: description,
          url: url.startsWith('http') ? url : `https://www.ietf.org${url}`
        });
      }
      
      return results;
    } catch (error) {
      throw new Error(`Failed to search for RFCs: ${error}`);
    }
  }

  /**
   * Get a list of the latest RFCs
   * @param limit Maximum number of RFCs to return
   * @returns List of latest RFC metadata
   */
  async getLatestRfcs(limit: number = 10): Promise<RfcMetadata[]> {
    try {
      const latestUrl = 'https://www.ietf.org/standards/rfcs/';
      const response = await axios.get(latestUrl);
      
      const dom = new JSDOM(response.data);
      const document = dom.window.document;
      
      // Extract latest RFCs
      const results: RfcMetadata[] = [];
      const rfcElements = document.querySelectorAll('table.table tr');
      
      let count = 0;
      for (const element of rfcElements) {
        if (count >= limit) break;
        
        const cells = element.querySelectorAll('td');
        if (cells.length < 3) continue; // Header row or invalid row
        
        const rfcLink = cells[0].querySelector('a');
        if (!rfcLink) continue;
        
        const rfcNumber = rfcLink.textContent?.trim().replace('RFC', '').trim() || '';
        const title = cells[1].textContent?.trim() || '';
        const date = cells[2].textContent?.trim() || '';
        
        if (rfcNumber) {
          results.push({
            number: rfcNumber,
            title,
            authors: [], // Would need to fetch the full RFC to get this
            date,
            status: '', // Would need to fetch the full RFC to get this
            abstract: '', // Would need to fetch the full RFC to get this
            url: `https://www.ietf.org/rfc/rfc${rfcNumber}.txt`
          });
          count++;
        }
      }
      
      return results;
    } catch (error) {
      throw new Error(`Failed to get latest RFCs: ${error}`);
    }
  }

  /**
   * Parse an RFC from HTML format
   */
  private parseHtmlRfc(html: string, rfcNumber: string, url: string): RfcContent {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Extract metadata
    const title = document.querySelector('h1')?.textContent?.trim() || `RFC ${rfcNumber}`;
    
    // Extract authors
    const authorElements = document.querySelectorAll('.authors .author');
    const authors: string[] = [];
    for (const authorEl of authorElements) {
      const authorName = authorEl.textContent?.trim();
      if (authorName) authors.push(authorName);
    }
    
    // Extract date
    const dateElement = document.querySelector('.pubdate');
    const date = dateElement?.textContent?.trim() || '';
    
    // Extract abstract
    const abstractElement = document.querySelector('.abstract');
    const abstract = abstractElement?.textContent?.trim() || '';
    
    // Extract status
    const statusElement = document.querySelector('.status');
    const status = statusElement?.textContent?.trim() || '';
    
    // Extract content sections
    const sections: RfcContent['sections'] = [];
    const sectionElements = document.querySelectorAll('section');
    
    for (const sectionEl of sectionElements) {
      const sectionTitle = sectionEl.querySelector('h2, h3, h4')?.textContent?.trim() || '';
      const sectionContent = sectionEl.innerHTML;
      
      // Check for subsections
      const subsectionElements = sectionEl.querySelectorAll('section');
      const subsections: { title: string; content: string }[] = [];
      
      for (const subsectionEl of subsectionElements) {
        const subsectionTitle = subsectionEl.querySelector('h3, h4, h5')?.textContent?.trim() || '';
        const subsectionContent = subsectionEl.innerHTML;
        
        if (subsectionTitle) {
          subsections.push({
            title: subsectionTitle,
            content: subsectionContent
          });
        }
      }
      
      if (sectionTitle) {
        sections.push({
          title: sectionTitle,
          content: sectionContent,
          subsections: subsections.length > 0 ? subsections : undefined
        });
      }
    }
    
    // Get full text
    const fullText = document.querySelector('body')?.textContent?.trim() || '';
    
    return {
      metadata: {
        number: rfcNumber,
        title,
        authors,
        date,
        status,
        abstract,
        url
      },
      sections,
      fullText
    };
  }

  /**
   * Parse an RFC from TXT format
   */
  private parseTxtRfc(text: string, rfcNumber: string, url: string): RfcContent {
    // Basic metadata extraction from text
    const lines = text.split('\n');
    
    // Extract title - usually in the beginning, often following "Title:"
    let title = `RFC ${rfcNumber}`;
    const titleMatch = text.match(/(?:Title|Internet-Draft):\s*(.*?)(?:\r?\n\r?\n|\r?\n\s*\r?\n)/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    }
    
    // Extract authors
    const authors: string[] = [];
    const authorSectionMatch = text.match(/(?:Author|Authors):\s*(.*?)(?:\r?\n\r?\n|\r?\n\s*\r?\n)/is);
    if (authorSectionMatch && authorSectionMatch[1]) {
      const authorLines = authorSectionMatch[1].split('\n');
      for (const line of authorLines) {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('Authors:')) {
          authors.push(trimmedLine);
        }
      }
    }
    
    // Extract date
    let date = '';
    const dateMatch = text.match(/(?:Date|Published):\s*(.*?)(?:\r?\n)/i);
    if (dateMatch && dateMatch[1]) {
      date = dateMatch[1].trim();
    }
    
    // Extract status
    let status = '';
    const statusMatch = text.match(/(?:Status of this Memo|Category):\s*(.*?)(?:\r?\n\r?\n|\r?\n\s*\r?\n)/is);
    if (statusMatch && statusMatch[1]) {
      status = statusMatch[1].replace(/\n/g, ' ').trim();
    }
    
    // Extract abstract
    let abstract = '';
    const abstractMatch = text.match(/(?:Abstract)\s*(?:\r?\n)+\s*(.*?)(?:\r?\n\r?\n|\r?\n\s*\r?\n)/is);
    if (abstractMatch && abstractMatch[1]) {
      abstract = abstractMatch[1].replace(/\n/g, ' ').trim();
    }
    
    // Extract sections - this is simplified and may miss some structure
    const sections: RfcContent['sections'] = [];
    let currentSection: string | null = null;
    let currentContent: string[] = [];
    
    // Simple section detection based on numbering patterns like "1.", "1.1.", etc.
    const sectionRegex = /^(?:\d+\.)+\s+(.+)$/;
    
    for (const line of lines) {
      const sectionMatch = line.match(sectionRegex);
      
      if (sectionMatch) {
        // Save previous section if exists
        if (currentSection !== null && currentContent.length > 0) {
          sections.push({
            title: currentSection,
            content: currentContent.join('\n')
          });
        }
        
        // Start new section
        currentSection = sectionMatch[1].trim();
        currentContent = [];
      } else if (currentSection !== null) {
        // Add to current section content
        currentContent.push(line);
      }
    }
    
    // Add the last section
    if (currentSection !== null && currentContent.length > 0) {
      sections.push({
        title: currentSection,
        content: currentContent.join('\n')
      });
    }
    
    return {
      metadata: {
        number: rfcNumber,
        title,
        authors,
        date,
        status,
        abstract,
        url
      },
      sections,
      fullText: text
    };
  }
}

export default new RfcService();
