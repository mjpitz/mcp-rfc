#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import rfcService from './services/rfcService.js';

class RfcServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: '@mjpitz/mcp-rfc',
        version: '0.2504.4',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupResourceHandlers();
    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupResourceHandlers() {
    // Define RFC resource templates
    this.server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async () => ({
        resourceTemplates: [
          {
            uriTemplate: 'rfc://{number}',
            name: 'RFC Document',
            description: 'Get an RFC document by its number',
            mimeType: 'application/json',
          },
          {
            uriTemplate: 'rfc://search/{query}',
            name: 'RFC Search Results',
            description: 'Search for RFCs by keyword',
            mimeType: 'application/json',
          },
        ],
      })
    );

    // Handle resource requests
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      
      // Handle RFC by number
      const rfcNumberMatch = uri.match(/^rfc:\/\/(\d+)$/);
      if (rfcNumberMatch) {
        const rfcNumber = rfcNumberMatch[1];
        try {
          const rfc = await rfcService.fetchRfc(rfcNumber);
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(rfc, null, 2),
              },
            ],
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to fetch RFC ${rfcNumber}: ${error}`
          );
        }
      }
      
      // Handle RFC search
      const searchMatch = uri.match(/^rfc:\/\/search\/(.+)$/);
      if (searchMatch) {
        const query = decodeURIComponent(searchMatch[1]);
        try {
          const results = await rfcService.searchRfcs(query);
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to search for RFCs: ${error}`
          );
        }
      }
      
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unsupported resource URI: ${uri}`
      );
    });
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_rfc',
          description: 'Fetch an RFC document by its number',
          inputSchema: {
            type: 'object',
            properties: {
              number: {
                type: 'string',
                description: 'RFC number (e.g. "2616")',
              },
              format: {
                type: 'string',
                description: 'Output format (full, metadata, sections)',
                enum: ['full', 'metadata', 'sections'],
                default: 'full',
              },
            },
            required: ['number'],
            additionalProperties: false,
          },
        },
        {
          name: 'search_rfcs',
          description: 'Search for RFCs by keyword',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search keyword or phrase',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return',
                default: 10,
              },
            },
            required: ['query'],
            additionalProperties: false,
          },
        },
        {
          name: 'get_rfc_section',
          description: 'Get a specific section from an RFC',
          inputSchema: {
            type: 'object',
            properties: {
              number: {
                type: 'string',
                description: 'RFC number (e.g. "2616")',
              },
              section: {
                type: 'string',
                description: 'Section title or number to retrieve',
              },
            },
            required: ['number', 'section'],
            additionalProperties: false,
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      // Add type assertion for args
      const typedArgs = args as Record<string, any>;
      
      switch (name) {
        case 'get_rfc': {
          if (typeof typedArgs.number !== 'string') {
            throw new McpError(
              ErrorCode.InvalidParams,
              'RFC number must be a string'
            );
          }
          
          try {
            const rfc = await rfcService.fetchRfc(typedArgs.number);
            
            // Format the output based on the requested format
            const format = typedArgs.format || 'full';
            let result;
            
            switch (format) {
              case 'metadata':
                result = rfc.metadata;
                break;
              case 'sections':
                result = rfc.sections;
                break;
              case 'full':
              default:
                result = rfc;
                break;
            }
            
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error fetching RFC ${typedArgs.number}: ${error}`,
                },
              ],
              isError: true,
            };
          }
        }
        
        case 'search_rfcs': {
          if (typeof typedArgs.query !== 'string') {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Search query must be a string'
            );
          }
          
          const limit = typeof typedArgs.limit === 'number' ? typedArgs.limit : 10;
          
          try {
            const results = await rfcService.searchRfcs(typedArgs.query);
            const limitedResults = results.slice(0, limit);
            
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(limitedResults, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error searching for RFCs: ${error}`,
                },
              ],
              isError: true,
            };
          }
        }
        
        case 'get_rfc_section': {
          if (typeof typedArgs.number !== 'string' || typeof typedArgs.section !== 'string') {
            throw new McpError(
              ErrorCode.InvalidParams,
              'RFC number and section must be strings'
            );
          }
          
          try {
            const rfc = await rfcService.fetchRfc(typedArgs.number);
            
            // Find the matching section
            const sectionQuery = typedArgs.section.toLowerCase();
            const section = rfc.sections.find(s => 
              s.title.toLowerCase().includes(sectionQuery) || 
              s.title.toLowerCase() === sectionQuery
            );
            
            if (!section) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Section "${typedArgs.section}" not found in RFC ${typedArgs.number}`,
                  },
                ],
                isError: true,
              };
            }
            
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(section, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                    text: `Error fetching section from RFC ${typedArgs.number}: ${error}`,
                },
              ],
              isError: true,
            };
          }
        }
        
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('RFC MCP server running on stdio');
  }
}

const server = new RfcServer();
server.run().catch(console.error);
