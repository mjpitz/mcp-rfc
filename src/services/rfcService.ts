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
      // Search on the RFC Editor website
      const searchUrl = `https://www.rfc-editor.org/search/rfc_search_detail.php?title=${encodeURIComponent(keyword)}&pubstatus%5B%5D=Any&pub_date_type=any`;
      const response = await axios.get(searchUrl);
      
      const dom = new JSDOM(response.data);
      const document = dom.window.document;
      
      // Extract search results
      const results: RfcMetadata[] = [];
      
      // The results are in a table with class 'gridtable'
      const resultsTable = document.querySelector('table.gridtable');
      
      if (!resultsTable) {
        // If we can't find the gridtable, look for any table after the results count
        const resultNodes = Array.from(document.querySelectorAll('p')).filter(
          node => node.textContent?.includes('results') && /\d+\s+results/.test(node.textContent)
        );
        
        if (resultNodes.length === 0) return results;
      }
      
      // Get all rows from the results table
      const rows = resultsTable?.querySelectorAll('tr');
      if (!rows || rows.length <= 1) return results;
      
      // Skip the header row
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.querySelectorAll('td');
        
        if (cells.length >= 5) {
          // Extract RFC number from first column
          const rfcLinkElement = cells[0].querySelector('a');
          if (!rfcLinkElement) continue;
          
          // Get RFC number from text content
          let rfcNumber = '';
          const rfcTextContent = rfcLinkElement.textContent?.trim() || '';
          const rfcMatch = rfcTextContent.match(/RFC\s*(\d+)/i);
          if (rfcMatch && rfcMatch[1]) {
            rfcNumber = rfcMatch[1];
          }
          
          if (!rfcNumber) continue;
          
          // Title is in the third column
          const title = cells[2].textContent?.trim() || '';
          
          // Authors are in the fourth column
          const authorsText = cells[3].textContent?.trim() || '';
          const authors = authorsText ? [authorsText] : [];
          
          // Date is in the fifth column
          const date = cells[4].textContent?.trim() || '';
          
          // Status is in the seventh column
          const status = cells[6]?.textContent?.trim() || '';
          
          // Get URL from the link in the first column
          const url = rfcLinkElement.getAttribute('href') || `https://www.rfc-editor.org/info/rfc${rfcNumber}`;
          
          results.push({
            number: rfcNumber,
            title,
            authors,
            date,
            status,
            abstract: '', // Would need to fetch the full RFC to get this
            url
          });
        }
      }
      
      return results;
    } catch (error) {
      console.error('Error in searchRfcs:', error);
      return []; // Return empty array instead of throwing
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
